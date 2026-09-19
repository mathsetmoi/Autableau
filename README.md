# Au Tableau !

> **Cette copie** ([mathsetmoi/Autableau](https://github.com/mathsetmoi/Autableau))
> est un fork d'[Au Tableau](https://github.com/remy-live/Autableau) de Rémy
> Devoddere. Elle y ajoute **Mes tableaux dans mon Drive** — un dossier par
> classe, un tableau par séance, rangés dans un dossier synchronisé par Google
> Drive pour ordinateur — ajoute la **calculatrice NumWorks** (collège ou lycée) parmi les outils, et corrige deux choses : l'encre écrite à côté d'un
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
   exemple `G:Mon Drive`.
2. Dans le tiroir de droite, onglet **Tableaux**, choisir **Mon Drive**, puis
   **Choisir le dossier de mon Drive** — par exemple `G:Mon DriveAu Tableau`.
3. Créer un dossier par classe (bouton **Nouveau dossier**), puis un tableau par
   séance (**Nouveau tableau**) : le fichier est créé dans la classe et tout ce
   qu'on y écrit s'y enregistre tout seul, au plus toutes les dix secondes.

Un tableau ouvert depuis le Drive s'y réenregistre : le bandeau « Vous
travaillez sur » le dit, avec l'heure de la dernière écriture. On ouvre une
séance d'un double-clic, on la renomme, on la glisse dans une autre classe, on
la supprime (Drive garde une corbeille trente jours). Le bouton **Enregistrer
dans votre Drive…** range dans le Drive un tableau qui n'y est pas encore.

Chaque séance est un fichier `.prof`, le format d'export d'un seul tableau :
l'import ordinaire (**Ouvrir un seul tableau**) sait donc les lire, et une
séance modifiée sur un autre poste est signalée à la réouverture.

Comme la sauvegarde automatique, cela demande Chrome ou Edge, et le navigateur
redemande à chaque ouverture le droit d'écrire dans le dossier : un clic sur
**Rouvrir** dans le tiroir, ou sur le bandeau qui le propose. Le code est dans
`lib/dossier/mon-dossier.js`, et n'a rien changé à `script.js` : les mises à
jour de l'auteur se reprennent avec `git merge upstream/main`.

## La calculatrice NumWorks, collège ou lycée

Rubrique **Maths - Numérique**, bouton **Calculatrice NumWorks** : on choisit
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
