// ============================================================
// UNE SÉANCE DU DRIVE, LUE SANS COMPTE
// ============================================================
// Les nouveaux liens désignent directement un fichier partagé en lecture.
// Aucune liste de dossier n'est demandée. Les fonctions de recherche par nom
// restent seulement pour les anciens liens déjà distribués.
//
// La clé n'est pas un secret : elle est restreinte, dans la console Google,
// au site qui a le droit de s'en servir. Elle peut être écrite dans
// lib/cloud/config.js (et le lien reste court) ou voyager dans le lien.
//
// Ce fichier sert aux deux bouts : au lecteur, qui va chercher la séance, et
// à la fenêtre de publication, qui vérifie la lecture sans connexion.
// ============================================================
(function () {
    'use strict';

    const API = 'https://www.googleapis.com/drive/v3/files';
    const CHAMPS = 'files(id,name,modifiedTime,size,mimeType)';

    const config = () => window.AUTABLEAU_PUBLICATION || {};

    // Ce qui dit où lire : le lien d'abord, la configuration du site ensuite.
    function reglages(params) {
        const p = params || new URLSearchParams(location.search);
        return {
            dossier: p.get('d') || config().dossier || '',
            cle: p.get('k') || config().cle || ''
        };
    }

    // L'identifiant d'un dossier, tel qu'on le tire du lien de partage :
    //   https://drive.google.com/drive/folders/1AbC…?usp=sharing
    // Un identifiant collé tel quel passe aussi.
    function idDepuisLeLien(brut) {
        const t = String(brut || '').trim();
        if (!t) return '';
        const m = t.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
        if (m) return m[1];
        if (/^[A-Za-z0-9_-]{10,}$/.test(t)) return t;
        return '';
    }

    // Ce que Google renvoie quand ça ne va pas, dit en français, avec ce
    // qu'il y a à faire — c'est ce qui manque le plus dans ses réponses.
    function expliquer(e) {
        const code = e && e.code;
        const raison = String((e && e.raison) || '');
        const message = String((e && e.message) || '');
        if (e && e.name === 'TypeError' && /fetch|network/i.test(message)) {
            return 'Pas de réseau, ou Google injoignable depuis ici.';
        }
        if (/keyInvalid|API key not valid/i.test(raison + message)) return 'La clé d\'API n\'est pas valide : vérifiez qu\'elle est recopiée entière.';
        if (/accessNotConfigured|has not been used|is disabled/i.test(raison + message)) {
            return 'L\'API Google Drive n\'est pas activée pour cette clé : dans la console Google Cloud, « API et services », activez « Google Drive API ».';
        }
        if (/API_KEY_HTTP_REFERRER_BLOCKED|referer|referrer/i.test(raison + message)) {
            return 'La clé refuse ce site : dans la console Google Cloud, ajoutez « ' + location.origin + '/* » aux sites autorisés pour cette clé.';
        }
        if (code === 403) return 'Google refuse la lecture : la séance n’est plus partagée, ou la clé API n’autorise pas ce site. Demandez à votre enseignant de vérifier le lien.';
        if (code === 404) return 'Séance introuvable ou accès retiré. Demandez le lien à votre enseignant.';
        if (code === 400) return 'Google ne comprend pas la demande' + (message ? ' : ' + message : '') + '.';
        if (code === 429) return 'Trop de demandes en même temps : réessayez dans un instant.';
        return message || 'Erreur inconnue en lisant le Drive.';
    }

    async function appeler(url, headers = {}) {
        const r = await fetch(url, { cache: 'no-store', credentials: 'omit', headers });
        if (r.ok) return r;
        let corps = null;
        try { corps = await r.json(); } catch (e) { corps = null; }
        const err = new Error((corps && corps.error && corps.error.message) || ('HTTP ' + r.status));
        err.code = r.status;
        err.raison = corps && corps.error && corps.error.errors && corps.error.errors[0] && corps.error.errors[0].reason;
        if (!err.raison && corps && corps.error && Array.isArray(corps.error.details)) {
            const d = corps.error.details.find(x => x && x.reason);
            if (d) err.raison = d.reason;
        }
        throw err;
    }

    // Une valeur dans une requête « q » : Google veut les apostrophes et les
    // barres obliques inverses échappées.
    const citer = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

    async function lister(dossier, cle) {
        if (!dossier || !cle) throw Object.assign(new Error('Il manque le dossier ou la clé'), { code: 0 });
        const q = citer(dossier) + ' in parents and trashed = false';
        const url = API + '?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(CHAMPS)
            + '&pageSize=1000&orderBy=name%20desc&key=' + encodeURIComponent(cle);
        const r = await appeler(url);
        const j = await r.json();
        return Array.isArray(j.files) ? j.files : [];
    }

    async function trouver(nom, dossier, cle) {
        if (!dossier || !cle) throw Object.assign(new Error('Il manque le dossier ou la clé'), { code: 0 });
        const q = 'name = ' + citer(nom) + ' and ' + citer(dossier) + ' in parents and trashed = false';
        const url = API + '?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(CHAMPS)
            + '&pageSize=5&key=' + encodeURIComponent(cle);
        const r = await appeler(url);
        const j = await r.json();
        const files = Array.isArray(j.files) ? j.files : [];
        // Deux fichiers du même nom : le plus récent.
        files.sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
        return files[0] || null;
    }

    async function telecharger(id, cle, resourceKey) {
        if (!/^[A-Za-z0-9_-]+$/.test(id || '') || !cle) throw new Error('Le lien de la séance est incomplet.');
        const url = API + '/' + encodeURIComponent(id) + '?alt=media&key=' + encodeURIComponent(cle);
        const headers = resourceKey ? { 'X-Goog-Drive-Resource-Keys': id + '/' + resourceKey } : {};
        const r = await appeler(url, headers);
        return r.text();
    }

    async function lireFichier(id, cle, resourceKey) {
        const texte = await telecharger(id, cle, resourceKey);
        let contenu;
        try { contenu = JSON.parse(texte); }
        catch (e) { throw new Error('Le fichier de la séance est illisible.'); }
        if (!contenu || !Array.isArray(contenu.data?.pages)) throw new Error('Ce fichier ne contient pas une séance Au Tableau.');
        return { fiche: { id }, contenu };
    }

    // La séance entière : on la cherche par son nom, puis on la lit.
    async function lireLaSeance(nom, dossier, cle) {
        const fiche = await trouver(nom, dossier, cle);
        if (!fiche) return { fiche: null, contenu: null };
        const texte = await telecharger(fiche.id, cle);
        let contenu = null;
        try { contenu = JSON.parse(texte); } catch (e) {
            throw Object.assign(new Error('Le fichier de la séance est illisible'), { code: 0 });
        }
        return { fiche, contenu };
    }

    window.DrivePublic = { reglages, idDepuisLeLien, expliquer, lister, trouver, telecharger, lireLaSeance, lireFichier };
})();
