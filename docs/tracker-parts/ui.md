# Tracker: home screen look and navigation (branch `ui-premium-home`)
| Item | Status | Evidence / limit |
| --- | --- | --- |
| Peacock (morpankh) colour palette and new module card look, hero banner with a feather-eye motif | DONE (look only) | Colours in `src/ui/theme.ts` and `src/features/home/modules.ts`. NOT looked at on a real phone or emulator by the app team; judge it on a device. The palette changes colours app wide. |
| On/off switch on every module card on the home screen | DONE (mocked store) | `__tests__/home-premium.test.tsx`: default on, off dims the card and stops it opening, on restores it, choice saved with `expo-secure-store` and restored, damaged saved value ignored, Hindi. It is only a home screen preference; it never changes what the server allows. |
| Bottom bar with Back, Home and Menu on every signed-in screen; Menu lists all modules | DONE (mocked router) | `__tests__/home-premium.test.tsx`. Not run on a phone. The bar is hidden on the login screen. Hindi and Marathi texts need a native speaker review. |
