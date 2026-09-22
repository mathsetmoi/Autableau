// Publication côté enseignant. Seul le fichier reçoit un droit de lecture
// anonyme. Le dossier et le jeton OAuth ne voyagent jamais dans le lien.
(function () {
    'use strict';
    const API = 'https://www.googleapis.com/drive/v3/files';
    const SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const MARQUE = 'seance-individuelle-v1';
    const DOSSIER = 'Au Tableau — séances publiées';
    const CHAMPS = 'id,name,mimeType,parents,trashed,resourceKey,appProperties,permissions(id,type,role)';
    let jeton = '', expiration = 0;

    const connecte = () => !!jeton && Date.now() < expiration;
    function deconnecter() { jeton = ''; expiration = 0; }

    function preparer() {
        if (window.AUTABLEAU_LECTEUR || document.getElementById('google-identity')) return;
        const script = document.createElement('script');
        script.id = 'google-identity';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        document.head.appendChild(script);
    }

    // Appeler directement depuis le bouton : Google exige un geste humain.
    function connecter(clientId) {
        deconnecter();
        return new Promise((resolve, reject) => {
            if (!clientId) return reject(new Error('Renseignez un identifiant client OAuth Google de type Application Web dans les réglages.'));
            if (!window.google?.accounts?.oauth2) {
                preparer();
                return reject(new Error('La connexion Google se charge. Réessayez dans quelques secondes.'));
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId, scope: SCOPE, include_granted_scopes: false,
                error_callback: () => reject(new Error('Connexion Google interrompue. Autorisez la fenêtre de connexion puis réessayez.')),
                callback: (r) => {
                    if (r.error || !r.access_token || !google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
                        reject(new Error('Autorisez Au Tableau à gérer les fichiers qu’il crée pour publier la séance.'));
                        return;
                    }
                    jeton = r.access_token;
                    expiration = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000;
                    resolve();
                }
            });
            client.requestAccessToken({ prompt: 'select_account' });
        });
    }

    async function appeler(url, options = {}, brut = false) {
        if (!connecte()) throw new Error('Reconnectez votre compte Google pour publier ou retirer une séance.');
        const r = await fetch(url, { ...options, cache: 'no-store', credentials: 'omit',
            headers: { ...options.headers, Authorization: 'Bearer ' + jeton } });
        if (r.ok) return brut ? r : r.status === 204 ? null : r.json();
        if (r.status === 401) {
            deconnecter();
            throw new Error('La connexion Google a expiré. Reconnectez-vous puis réessayez.');
        }
        const corps = await r.json().catch(() => ({}));
        const e = new Error(corps.error?.message || 'Google Drive refuse la demande (HTTP ' + r.status + ').');
        e.code = r.status;
        throw e;
    }
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ficheDe = (id) => appeler(API + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(CHAMPS));

    function estPrive(d) {
        // Une liste absente ne prouve pas que le dossier est privé.
        return d.mimeType === 'application/vnd.google-apps.folder' && !d.trashed
            && Array.isArray(d.permissions) && d.permissions.length > 0
            && d.permissions.every(p => p.type === 'user' && p.role === 'owner');
    }
    async function liste(q, fields) {
        let page = '', fichiers = [];
        do {
            const p = new URLSearchParams({ q, fields: 'nextPageToken,files(' + fields + ')', pageSize: '1000' });
            if (page) p.set('pageToken', page);
            const r = await appeler(API + '?' + p);
            fichiers = fichiers.concat(r.files || []);
            page = r.nextPageToken || '';
        } while (page);
        return fichiers;
    }
    async function dossierPrive() {
        const dossiers = await liste("trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='autableauDossier' and value='" + MARQUE + "' }", CHAMPS);
        const prive = dossiers.find(estPrive);
        if (prive) return prive;
        // Jamais le dossier public de l'ancienne configuration : nouvelle
        // copie à la racine de Mon Drive, sans aucune permission ajoutée.
        const cree = await appeler(API + '?fields=id', json('POST', {
            name: DOSSIER, mimeType: 'application/vnd.google-apps.folder',
            appProperties: { autableauDossier: MARQUE }
        }));
        const dossier = await ficheDe(cree.id);
        if (!estPrive(dossier)) throw new Error('Le dossier de publication doit être privé. Vérifiez ses autorisations dans Google Drive.');
        return dossier;
    }

    async function envoyer(metadata, contenu) {
        const media = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
        if (media.size > 5 * 1024 * 1024) {
            // Les photos, PDF et le film d'une heure dépassent facilement
            // les 5 Mo permis par l'envoi multipart.
            const depart = await appeler('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
                ...json('POST', metadata), headers: { 'Content-Type': 'application/json',
                    'X-Upload-Content-Type': 'application/json', 'X-Upload-Content-Length': String(media.size) }
            }, true);
            const adresse = new URL(depart.headers.get('Location') || '');
            if (adresse.origin !== 'https://www.googleapis.com' || !adresse.pathname.startsWith('/upload/drive/')) {
                throw new Error('Google n’a pas fourni une adresse d’envoi valide. Réessayez.');
            }
            return appeler(adresse.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: media });
        }
        const boundary = 'autableau_' + crypto.randomUUID();
        const body = new Blob([
            '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', JSON.stringify(metadata),
            '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n', media,
            '\r\n--' + boundary + '--'
        ], { type: 'multipart/related; boundary=' + boundary });
        return appeler('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST', headers: { 'Content-Type': body.type }, body
        });
    }

    async function publier(nom, contenu, cle) {
        if (!cle) throw new Error('Renseignez la clé API dans les réglages.');
        const dossier = await dossierPrive();
        const metadata = { name: nom + '.prof', mimeType: 'application/json', parents: [dossier.id],
            appProperties: { autableauReplay: MARQUE }, description: JSON.stringify(contenu.seance) };
        let fichier;
        try {
            fichier = await envoyer(metadata, contenu);
            // Recontrôler le parent juste avant de rendre la copie lisible.
            if (!estPrive(await ficheDe(dossier.id))) throw new Error('Le dossier a été partagé. Remettez son accès général sur « Limité » avant de publier.');
            await appeler(API + '/' + encodeURIComponent(fichier.id) + '/permissions?fields=id',
                json('POST', { type: 'anyone', role: 'reader', allowFileDiscovery: false }));
            const fiche = await ficheDe(fichier.id);
            // Même requête que chez l'élève : aucune connexion enseignant.
            try { await DrivePublic.lireFichier(fiche.id, cle, fiche.resourceKey); }
            catch (e) { e.message = DrivePublic.expliquer(e); throw e; }
            return fiche;
        } catch (e) {
            if (fichier?.id) {
                try { await appeler(API + '/' + encodeURIComponent(fichier.id), json('PATCH', { trashed: true })); }
                catch (_) { e.message += ' Une copie a été créée sur Drive : vérifiez son partage avant de réessayer.'; }
            }
            throw e;
        }
    }

    async function lister() {
        const fichiers = await liste("trashed=false and appProperties has { key='autableauReplay' and value='" + MARQUE + "' }",
            CHAMPS + ',modifiedTime,size,description');
        return fichiers.filter(f => (f.permissions || []).some(p => p.type === 'anyone'))
            .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    }
    async function retirer(id) {
        const f = await ficheDe(id);
        if (f.appProperties?.autableauReplay !== MARQUE) throw new Error('Ce fichier n’est pas une séance publiée par Au Tableau.');
        // Le partage du parent compromettrait aussi les autres séances.
        for (const parent of f.parents || []) {
            if (!estPrive(await ficheDe(parent))) throw new Error('Le dossier de cette séance est partagé. Remettez aussi son accès général sur « Limité » dans Drive.');
        }
        for (const p of f.permissions || []) {
            if (p.type === 'anyone') await appeler(API + '/' + encodeURIComponent(id) + '/permissions/' + encodeURIComponent(p.id), { method: 'DELETE' });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preparer);
    else preparer();
    window.DrivePublication = { connecter, connecte, deconnecter, publier, lister, retirer, DOSSIER };
})();
