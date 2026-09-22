# Au Tableau !

> **Cette copie** ([mathsetmoi/Autableau](https://github.com/mathsetmoi/Autableau))
> est un fork d'[Au Tableau](https://github.com/remy-live/Autableau) de Rémy
> Devoddere. Elle y ajoute **Mes tableaux dans mon Drive** — un dossier par
> classe, un tableau par séance, rangés dans un dossier synchronisé par Google
> Drive pour ordinateur — ajoute la **calculatrice NumWorks** (collège ou lycée) et les **automatismes** (banque de questions, séries, journal par classe) parmi les outils, permet de **publier une séance pour le cahier de textes** — un lien que les élèves et les parents ouvrent pour rejouer la construction du tableau —, rend le déplacement de la vue fluide (la photo du dernier rendu glisse pendant le geste, on repeint quand la main s'arrête), et corrige quatre choses : l'écriture qui disparaissait par endroits quand on déplaçait la vue (le tri spatial perdait des traits), le tableau qui se repeignait plusieurs fois par image, l'encre écrite à côté d'un
> morceau de document qui disparaissait, et un tableau neuf qui n'enregistrait
> rien. Le reste est le travail de l'auteur, sous la même licence.

Un tableau interactif pour la classe. Il s'ouvre dans un navigateur, il n'a
besoin de rien d'autre, et il fonctionne sans connexion.

Pas d'installation, pas de compte, pas de droits administrateur : on copie le
dossier, on ouvre `index.html`, on écrit. C'est ce qui permet de s'en servir sur
le poste d'une salle de classe, sur une clé USB, ou sur un vidéoprojecteur
interactif dont personne n'a le mot de passe.

## Démarrer

1. Récupérer le dossier (bouton **Code → Download ZIP**, puis décompresser).
2. Ouvrir `index.html` dans **Chrome, Edge ou un navigateur Chromium**.
3. C'est tout.

> **Pourquoi Chromium ?** Firefox et Safari font tourner le reste, mais ils ne
> savent pas encore écrire dans un dossier choisi : la sauvegarde automatique
> décrite ci-dessous n'y fonctionne pas, et il faut exporter à la main. Sur un
> poste de classe, prendre Chrome ou Edge évite cette corvée.

Pour s'en servir à plusieurs postes, on peut aussi le déposer sur un
hébergement statique (GitHub Pages, l'espace web de l'établissement). Les
sources en ligne — Dropbox, Google Drive, Nextcloud — n'existent que dans ce
cas : elles exigent une adresse en `http(s)` et ne s'affichent pas quand la
page est ouverte depuis un dossier.

## Mettre la sauvegarde en place — à faire en premier

Tout le travail vit dans le stockage du navigateur. Un « effacer les données de
navigation », un profil scolaire réinitialisé, un changement de poste, et il
n'en reste rien.

**Menu Exporter → Sauvegarde automatique.** On désigne un dossier une fois — le
disque, une clé USB, un dossier synchronisé — et une copie complète de l'espace
s'y écrit toute seule : un fichier par jour, les dix derniers conservés. À la
réouverture, le navigateur redemande le droit d'écrire ; un bandeau propose de
le rendre en un clic.

Sans cela, l'application rappelle au bout de sept jours qu'aucune copie n'a été
faite.

## Mes tableaux dans mon Drive

« Mes tableaux » vit dans le navigateur du poste. Pour retrouver ses séances
d'un ordinateur à l'autre, classe par classe, le tiroir de droite a une seconde
source : **Mon Drive**.

1. Installer **Google Drive pour ordinateur** (ou OneDrive, ou une clé USB : tout
   dossier du disque convient). Le Drive apparaît alors comme un lecteur, par
   exemple `G:\Mon Drive`.
2. Dans le tiroir de droite, onglet **Tableaux**, choisir **Mon Drive**, puis
   **+ Ajouter un dossier** — par exemple `G:\Mon Drive\Au Tableau`.
3. Créer un dossier par classe (bouton **Nouveau dossier**), puis un tableau par
   séance (**Nouveau tableau**) : le fichier est créé dans la classe et tout ce
   qu'on y écrit s'y enregistre tout seul, au plus toutes les dix secondes.

**Plusieurs emplacements, et l'on passe de l'un à l'autre d'un clic.** Mon
Drive, un Drive partagé, une clé USB, un dossier du disque : le **+** les
ajoute à la liste, en tête du tiroir. La ligne en évidence est le dossier
ouvert ; un clic sur une autre montre son arbre à elle, un double-clic la
renomme (le dossier, lui, garde son nom), la croix la retire de la liste sans
toucher au dossier ni aux tableaux. Le tableau ouvert reste ouvert quand on
regarde ailleurs, et continue de s'enregistrer dans son fichier à lui.

Un tableau ouvert depuis le Drive s'y réenregistre : le bandeau « Vous
travaillez sur » le dit, avec l'heure de la dernière écriture. On ouvre une
séance d'un double-clic, on la renomme, on la glisse dans une autre classe, on
la supprime (Drive garde une corbeille trente jours). Le bouton **Enregistrer
dans votre Drive…** range dans le Drive un tableau qui n'y est pas encore.

Chaque séance est un fichier `.prof`, le format d'export d'un seul tableau :
l'import ordinaire (**Ouvrir un seul tableau**) sait donc les lire, et une
séance modifiée sur un autre poste est signalée à la réouverture.

Comme la sauvegarde automatique, cela demande Chrome ou Edge, et le navigateur
redemande à chaque ouverture le droit d'écrire dans un dossier — une fois par
emplacement, sur un geste : le clic sur son nom suffit, ou celui du bandeau qui
le propose. Le code est dans
`lib/dossier/mon-dossier.js`, et n'a rien changé à `script.js` : les mises à
jour de l'auteur se reprennent avec `git merge upstream/main`.

## Écrire au stylet

Avec une tablette graphique (Wacom, par exemple), trois choses sont réglées
dans `lib/tableau/stylet.js` :

- **tous les échantillons de la tablette sont posés**, y compris ceux que le
  navigateur groupe entre deux images — une boucle rapide reste une boucle ;
- **le survol que la tablette envoie sous un autre nom** pendant qu'on écrit
  ne coupe plus le trait ;
- **la pression a un plancher** (20 %) et ses sauts sont adoucis : un contact
  léger ne fait plus un cheveu, le trait s'affine aux extrémités sans
  disparaître.
- **la gomme du stylet efface** (`lib/tableau/gomme-du-stylet.js`) : on
  retourne le stylet, on frotte, l'encre touchée s'en va — traits, segments,
  figures —, et l'outil d'avant revient au relâcher. Une photo, un texte ou
  un objet verrouillé sous le frottement restent en place. Un frottement fait
  un seul pas d'annulation.

Côté Windows, dans les réglages de la tablette, laisser **Windows Ink** activé :
sans lui, le navigateur ne reçoit pas la pression et voit le stylet comme une
souris.

## Les automatismes

Les automatismes sont les questions de début d'heure : cinq à dix questions
courtes, projetées une à une, que la classe traite sur l'ardoise avant la
correction. Rubrique **Exercices**, bouton **Automatismes** : une fenêtre à
trois volets.

- **La banque** : vos questions, avec leur réponse, un thème et un niveau. Les
  formules s'écrivent entre dollars, comme dans l'outil Texte : `Développer
  $(x+1)^2`. Chaque question dit combien de fois elle a été posée, à qui et
  quand ; le filtre **Posée à…** distingue, pour une classe, ce qu'elle a déjà
  eu et ce qu'elle n'a jamais eu.
- **Les séries** : cochez des questions, faites-en une série — l'automatisme
  d'une heure. On la réordonne, on règle la durée par question, on la
  **projette** (une question à la fois, Espace pour la réponse, T pour toutes
  d'un coup au moment de corriger), on la **pose au tableau** en un tampon
  pour corriger dessus, on la refait à une autre classe.
- **Le journal** : chaque projection s'y écrit toute seule, avec la classe du
  moment (la pastille en haut à droite du tableau). On le filtre par classe et
  par mot — le mot cherche aussi dans les thèmes. **Marquer comme donnée** y
  inscrit une série distribuée sur papier.

Tout vit sur cet ordinateur, comme les classes ; une copie part dans le
dossier du Drive quand il est ouvert (`automatismes.json`, à la racine), et un
autre poste la reprend à l'ouverture si elle est plus récente que la sienne.
**Exporter** et **Importer** échangent la banque en JSON avec un collègue ;
l'import ajoute, il n'écrase rien. Le code est dans
`lib/automatismes/automatismes.js`.

## Publier la séance dans le cahier de textes

Un élève absent, un parent qui demande ce qui a été fait : on colle **un lien**
dans le cahier de textes de Pronote, et ce lien rejoue la séance. Pas un PDF
du tableau fini — la construction entière, trait après trait, avec un bouton
de lecture, comme on l'a faite devant la classe.

Le lecteur (`lecteur.html`) est l'application elle-même, les mains liées :
mêmes traits, mêmes formules, mêmes documents, mais aucun outil, et rien ne
s'écrit — ni sur la séance, ni dans le navigateur de celui qui regarde. Il
s'ouvre sans compte et sans installation, sur un téléphone comme sur un
ordinateur : ▶ pour rejouer, ← → pour avancer pas à pas, la vitesse, les
pages, et « tout voir » pour cadrer le tableau entier. La vue suit l'écriture
au lieu de laisser chercher où ça se passe.

**L'installation, une fois pour toutes** (bouton **Publier pour le cahier de
textes**, au bas du panneau Mon Drive ou dans la fenêtre Exporter) :

1. Partager un dossier `Séances publiées` de votre Drive en **« Tout
   utilisateur disposant du lien »**, en Lecteur.
2. Créer une **clé d'API Google** (console Google Cloud → activer *Google
   Drive API* → Identifiants → Clé API), restreinte à votre site et à cette
   API. Elle ne donne accès qu'à ce qui est déjà public. Si votre compte
   d'établissement n'a pas accès à Google Cloud — c'est fréquent —, la clé
   d'un compte personnel convient : elle ne sert qu'à lire un dossier public.
3. Coller le lien du dossier et la clé dans la fenêtre, rubrique **Le dossier
   et la clé**. Elles restent dans ce navigateur ; écrites dans
   `lib/cloud/config.js`, elles valent pour tout le site et raccourcissent
   les liens.
4. Dans la même rubrique, **désigner le dossier** où les séances seront
   écrites — le même dossier, vu du disque cette fois (`G:\Mon Drive\Séances
   publiées`). Sans cela, elles partiraient à la racine de l'emplacement
   ouvert, qui change quand on change de classe.

**Publier** demande un titre, une classe et une date, écrit la séance dans le
dossier partagé — Drive Desktop l'envoie tout seul — et rend le lien, avec le
texte à coller dans le champ « Contenu » de la séance Pronote : la date, le
titre, les automatismes posés ce jour-là à cette classe, et le lien. « Vérifier
que c'est en ligne » demande à Google si l'envoi est terminé.

**Ce qui est publié est public** : le lien s'ouvre sans compte, et un lien se
recopie. Ne publiez pas un tableau où figurent des noms d'élèves. L'onglet
« Déjà publiées » liste les séances en ligne et permet d'en retirer une — le
lien cesse alors d'ouvrir quoi que ce soit.

Le film enregistré avec le tableau porte désormais **toute** la séance : ce que
l'historique d'annulation jette au-delà de ses deux cents étapes est archivé
sur la page (`lib/tableau/film-complet.js`). Les tableaux enregistrés
auparavant s'ouvrent quand même : le lecteur montre le tableau tel qu'il a
fini, et le dit. Le code est dans `lib/lecteur/`.

## La calculatrice NumWorks, collège ou lycée

Rubrique **Maths - Algèbre**, bouton **Calculatrice NumWorks** : on choisit
le modèle — la scientifique du collège ou la graphique du lycée — et la
calculatrice se pose sur le tableau, en français, dans une fenêtre qui se
déplace, se redimensionne, se met en grand et part avec la séance. On la
manipule à la souris, au doigt ou au clavier (cliquer dessus d'abord).

C'est l'émulateur de NumWorks lui-même, servi par leur site : il faut le
réseau la première fois, ensuite le navigateur le garde en cache. La page
`lib/numworks/calculatrice.html` pose leur composant avec les bons réglages ;
quand NumWorks met à jour son émulateur, les adresses qu'elle contient sont à
relire dans le code source de leurs pages (c'est écrit en tête du fichier).

## Ce qu'il y a dedans

- **Écrire et tracer** : crayon, surligneur, laser, textes, formes, points,
  segments, cercles, arcs, courbes, polygones — avec aimantation sur le
  quadrillage, les outils et les intersections.
- **Les instruments** : règle, équerre, rapporteur, compas, qui se posent sur le
  tableau, se tournent et servent à tracer pour de bon.
- **Les fonds** : page blanche, petits carreaux, Seyès, copie d'examen, papier
  millimétré, points, isométrique, avec repère et quadrillage réglables.
- **Les documents** : ouvrir un PDF, le feuilleter, chercher dans son texte,
  écrire dessus, repérer automatiquement les zones à remplir d'un polycopié.
  Le fichier part avec le tableau : on le rouvre entier, pas en photo.
- **Le lecteur** : rejouer la construction du tableau devant la classe, à la
  vitesse qu'on veut, en boucle, avec un fondu entre les étapes.
- **Les classes** : élèves, groupes, points, badges, tirage au sort.
- **Quatre-vingt-six outils** rangés par matière — mathématiques surtout, mais
  aussi physique-chimie, français, histoire-géographie, musique, informatique,
  plus des jeux et des outils de gestion de classe.

## Travailler sur le code

Aucune dépendance, aucune étape de compilation : on modifie un fichier, on
recharge la page.

| Fichier | Rôle |
|---|---|
| `index.html` | La page et toute l'interface |
| `script.js` | Le tableau : dessin, objets, pages, documents, sauvegarde |
| `plugin.js` | Les quatre-vingt-six outils |
| `style.css` | L'apparence |
| `lib/` | Les bibliothèques fournies (voir `NOTICE.md`) |
| `lib/dossier/` | Mes tableaux dans mon Drive (ce fork) |
| `lib/numworks/` | La calculatrice NumWorks, collège ou lycée (ce fork) |
| `lib/automatismes/` | Les automatismes : banque de questions, séries, journal de ce qui a été donné (ce fork) |
| `lib/lecteur/` | Rejouer une séance publiée, et la publier pour Pronote (ce fork) |
| `lib/tableau/` | Le film entier de la séance, le déplacement de la vue (un dessin par image, la photo qui glisse) et le stylet (échantillons groupés, faux survol filtré, pression adoucie, gomme du stylet) — ce fork |
| `tests/` | La suite de non-régression |

Après toute modification d'un de ces fichiers, penser à incrémenter le `?v=` de
la balise correspondante dans `index.html` : sans cela le navigateur ressert son
ancienne copie.

### Les tests

Ils pilotent un vrai navigateur, dessinent, cliquent, exportent, et vérifient
que ce qui marchait marche encore. Ils tournent aussi à chaque poussée sur
`main`.

```bash
npm install --no-save playwright
npx playwright install --with-deps chromium
node tests/run.cjs            # toute la suite
node tests/run.cjs documents  # seulement les fichiers dont le nom contient « documents »
```

La règle de la maison : **une correction n'est finie que lorsqu'on a réintroduit
le bug et vu le test tomber.** Un test qui passe dans les deux cas ne prouve
rien. Le détail est dans `tests/README.md`.

## Licence

**PolyForm Noncommercial 1.0.0** — voir `LICENSE`.

Chacun peut s'en servir, le modifier et le partager, à condition que ce ne soit
pas à des fins commerciales. L'usage par un établissement scolaire, une
association, une administration ou un particulier est expressément permis.

Ce n'est donc pas une licence « open source » au sens formel du terme, puisque
celles-ci autorisent toutes l'usage commercial. C'est un choix assumé : le
travail reste libre pour les collègues, et personne ne peut le revendre.

Les bibliothèques fournies gardent leurs propres licences, qui autorisent leur
redistribution mais imposent de conserver leurs mentions : elles sont réunies
dans `NOTICE.md`. Les données cartographiques issues de `world-countries`
restent en particulier sous licence ODbL.

---

© 2026 Rémy Devoddere
