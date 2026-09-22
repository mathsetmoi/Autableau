// Identifiant client Google, nécessaire au sélecteur de fichiers Drive.
//
// Ce n'est pas un secret : Google le prévoit visible dans la page, et il ne
// donne rien à lui seul. Ce qui protège le compte, c'est la liste des
// « origines JavaScript autorisées » déclarée dans la console Google Cloud :
// n'y mettre QUE le domaine du site. Sans cela, le sélecteur refusera de
// s'ouvrir ailleurs — c'est le comportement voulu.
//
// Laisser vide désactive proprement la fonction : le bouton ne s'affiche pas.
window.AUTABLEAU_DRIVE_CLIENT_ID = '104179953661-2h0q8ada8m22j3d8uhe4ra3rbgfdp83p.apps.googleusercontent.com';

// Clé d'application Dropbox (« App key »). Comme l'identifiant Google, ce
// n'est pas un secret : elle est visible dans la page et ne donne rien à elle
// seule. Ce qui protège les comptes, c'est la liste des « Redirect URIs »
// déclarées dans la console Dropbox — n'y mettre QUE l'adresse du site.
//
// Ne JAMAIS mettre l'« App secret » ici : le navigateur utilise le flux PKCE,
// qui n'en a pas besoin, et un secret publié dans une page est un secret perdu.
//
// Laisser vide est très bien : chaque enseignant peut alors saisir sa propre
// clé dans la fenêtre « Ouvrir un fichier », et elle reste sur sa machine.
window.AUTABLEAU_DROPBOX_APP_KEY = '';

// LES SÉANCES PUBLIÉES POUR LES ÉLÈVES (lib/lecteur). Le lecteur va chercher
// la séance dans un dossier du Drive partagé « à tout utilisateur disposant
// du lien », avec une clé d'API Google. Ni l'un ni l'autre n'est un secret :
// le dossier est public par construction, et la clé est restreinte, dans la
// console Google Cloud, à ce site. Écrits ici, ils n'ont plus à voyager dans
// chaque lien, qui reste court ; laissés vides, la fenêtre « Publier pour
// Pronote » les met dans le lien.
window.AUTABLEAU_PUBLICATION = {
    dossier: '1QH-KqRAm3_ZTn2X6Qv2uMVjwGRVgndy5',    // l'identifiant du dossier partagé (la fin de son lien de partage)
    cle: 'AIzaSyDpAyFTCh_zQMaK_EqVoT1a7vW84lQK8BI',        // la clé d'API Google, restreinte à ce site
    adresse: 'https://mathsetmoi.github.io/Autableau'     // l'adresse publique du site, si elle n'est pas celle où l'on est
};
