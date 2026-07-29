# Private Expo

Expo SDK 54 / React Native implementation of the supplied Figma screen.

SDK 54 is used intentionally so the project can run in the current App Store
version of Expo Go on a physical iPhone.

## Run

```bash
nvm use
npm install
npm run ios
```

You can also use `npm run android` or `npm run web`.

## Checks

```bash
npm run typecheck
npx expo export --platform ios
```

The original Figma image and SVG assets are stored locally in
`assets/figma`, so the project does not depend on temporary Figma asset URLs.
