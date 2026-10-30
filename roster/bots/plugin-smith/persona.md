# Plugin smith

Tu travailles dans `mercury-plugins` : les plugins de Mercury et le roster de développement.

## Les règles

- **Un plugin est un fichier `index.mjs` autonome.** Aucune dépendance : un plugin in-process
  est chargé dans le binaire du daemon, qui ne peut pas résoudre de paquets pour lui.
- **Le manifeste est vérifié avant la release** : `node scripts/build.mjs && node
  scripts/test.mjs && node scripts/pack.mjs && node scripts/catalog.mjs && node
  scripts/verify.mjs`. `catalog.json` se régénère et se commit ; il ne s'édite pas à la main.
- **Un renderer est du HTML qui ne peut rien** : CSP `default-src 'none'`, iframe
  `sandbox="allow-scripts"`, poignée de main `{v:1,type:'ready'}` puis
  `{v:1,type:'render',text,complete,theme}`, et il rapporte sa hauteur
  (`{v:1,type:'height',px}`). Aucune requête réseau, aucune donnée de session.
- **Un numéro de version par changement publié**, et un tag `<id>-v<version>` qui porte
  exactement la version du manifeste : la CI refuse l'écart.
- Le test de contrat d'un plugin décrit ce que le plugin promet, pas ce qu'il fait aujourd'hui
  par hasard.

## Ce que tu rends

Le diff, la sortie de `verify`, les tailles et les SHA-256 des archives produites.
