# Tracker: home screen look and navigation (branch `ui-premium-home`)
| Item | Status | Evidence / limit |
| --- | --- | --- |
| Peacock (morpankh) colour palette and new module card look, hero banner with a feather-eye motif | DONE (look only) | Colours in `src/ui/theme.ts` and `src/features/home/modules.ts`. NOT looked at on a real phone or emulator by the app team; judge it on a device. The palette changes colours app wide. |
| On/off switch on every module card on the home screen | DONE (mocked store) | `__tests__/home-premium.test.tsx`: default on, off dims the card and stops it opening, on restores it, choice saved with `expo-secure-store` and restored, damaged saved value ignored, Hindi. It is only a home screen preference; it never changes what the server allows. |
| Bottom bar with Back, Home and Menu on every signed-in screen; Menu lists all modules | DONE (mocked router) | `__tests__/home-premium.test.tsx`. Not run on a phone. The bar is hidden on the login screen. Hindi and Marathi texts need a native speaker review. |
| Run on an Android emulator (x86_64, Android 35), signed in as a dev user with password login | DONE (one manual run) | Checked by hand on the emulator: login, home, switch off and on, switch kept after restarting the app, an Off card does not open, Back, Home and Menu, opening Operations and Customers. NOT a recorded test. The emulator build used the `agro360-web` client in a local `.env` because the `agro360-mobile` client does not exist on that server (Keycloak answers `invalid_client`); that is a backend task. |
| Sign-in says plainly when the server has no such client | DONE (mocked client) | `__tests__/password-login.test.ts`: `invalid_client` returns `client` (not "wrong password"). Texts in English, Hindi and Marathi, native review still needed. |
| Switch on the module card, and home top spacing | FIXED after the emulator run | On Android the card's elevation took the touches, so the switch now has a higher elevation; the home screen now leaves room for the status bar. Dimming an Off card uses dimmed contents, not opacity on the whole card (opacity drew a box round the shadow). |
| Master switch next to "All modules": off hides every module card, on shows them all (also ones switched off one by one) | DONE (mocked store) + checked by hand on the emulator | `__tests__/home-premium.test.tsx` (5 tests: default on, off hides all and shows a note, on restores all and clears single Off flags, remembered after restart, Hindi). On the emulator: off hid all six cards and showed the note, on brought them back. The choice is saved on the phone with `expo-secure-store`; it only changes what the home screen shows. Hindi and Marathi texts need a native speaker review. |

# Tracker: UI sweep (all 145 static screens opened on an Android emulator, debug build, dev server)
| Fix | Status | Evidence / limit |
| --- | --- | --- |
| Every screen except Home and Login now starts below the status bar (edge to edge); the 75 native headers that repeated the title are removed | DONE, seen on the emulator | `app/_layout.tsx`. `npx tsc`, `eslint` clean. No test for the inset itself (it needs a device). |
| Stock check: empty gap under the branch chips (horizontal ScrollView grew by default) | DONE, seen on the emulator | `app/stock.tsx` |
| Stock counts crashed on open (server sends a plain array, the screen expected `{ items }`) | DONE | `__tests__/stk-inventory.test.tsx` (new test with the real shape). The old mock used `{ items }`, which hid the bug. |
| Demand forecast and Season plan showed "Some details are not valid" (the server needs a branch; the app sent none) | DONE, seen on the emulator | First branch is used until the user picks one. `__tests__/ai-stock.test.tsx` updated. |
| Quantities without six decimals (ledger, reorder, valuation, stock reports); ledger movement names and payment modes as words; negative cash outlook as `-₹x`; "1 complaint" singular | DONE | `__tests__/ui-fixes.test.ts` and the updated suites. |
| No flash of the login screen with the bottom bar while the saved session loads; login logo clear of the gesture bar | DONE in code, login not re-checked on the emulator after the change | `app/_layout.tsx`, `app/login.tsx` |
| Detail screens opened without an id (risk case, problem products, quiz) say "not found" instead of a blank page | DONE in code, not re-checked on the emulator | `src/features/ai/*` |
| NOT fixed: raw codes in Forms and menu, Security centre role names and Settings payment modes; Attendance register month row alignment; Daily alerts shows raw numbers inside server text; keyboard hides the Sign in button on login (the keyboard Done key submits) | OPEN | Seen in the screen tour, not changed. |
| Full run: `npm test` 84 suites, 1228 tests passed; `npm run typecheck` clean; `npm run lint` 0 errors, 2 old warnings in `__tests__/errors.test.ts` | DONE | Hindi and Marathi texts for the new plural forms were written by the app team, not by a native speaker. |

# Tracker: premium UI polish (same colours, same layout)
| Change | Status | Evidence / limit |
| --- | --- | --- |
| Shared tokens in `src/ui/theme.ts` (`surface.card`, `shadow`, `lineStrong`, `pill`, `pressedOpacity`); no brand colour changed | DONE | Seen on the emulator. |
| Cards: soft teal shadow, radius 16, a little more padding (19 card styles); chips are pills (9); inputs have a firmer edge (15); page titles 24 px with tighter spacing (6) | DONE, seen on the emulator for about 20 screens | Not every one of the 145 screens was looked at again after this change. |
| Primary button: pressed feedback, ripple, light shadow; ghost button uses the brand colour for edge and text | DONE | `src/ui/Button.tsx`. Other screens that draw their own buttons were not changed. |
| Shared inputs show a brand-colour ring on focus and a red edge on error; chips dim while pressed | DONE in `src/ui/kit.tsx` and `src/features/purchase/ui.tsx` only | Fields that are built by hand in other files do not have the focus ring yet. |
| Screens that only had the old header now show their own heading (Customers, New complaint, New purchase order, AI assistant, AI suggestions) | DONE | Seen on the emulator for the first four. |
| Not done: dark theme, tablet layout, animations beyond press feedback, sidebar and footer (the app has none) | NOT BUILT | |
| Run: `npm test` 84 suites / 1228 tests passed, `npm run typecheck` clean, `npm run lint` 0 errors | DONE | |
