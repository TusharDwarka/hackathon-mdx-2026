// Self-check for the translator: npx tsx components/ui/i18n.check.ts
import assert from "node:assert";
import { translate } from "./i18n";
const t = (s: string, l: "fr" | "mfe" = "fr") => translate(s, l);
assert.equal(t("Log out"), "Se déconnecter");
assert.equal(t("Log out", "mfe"), "Dekonekte");
assert.equal(t("Start round · 3 stops"), "Commencer la tournée · 3 arrêts");
assert.equal(t("Start round · 1 stop", "mfe"), "Koumans tournee · 1 arè");
assert.equal(t("Water in Vacoas", "mfe"), "Dilo dan Vacoas");
assert.equal(t("Reported: no water"), "Signalé : pas d'eau");
assert.equal(t("3 stops are not served yet. Location sharing stops."), "3 arrêts ne sont pas encore servis. Le partage de position s'arrête.");
assert.equal(t("Sat 14 Nov"), "sam. 14 nov.");
assert.equal(t("Rue Royale"), null); // a street name stays as it is
console.log("i18n ok");
