// Prodejní nastavení. Upravuje se tady, nic jiného měnit nemusíte.

// Cena za m² v Kč (číslo), nebo null = v detailu se ukáže "Na dotaz".
export const PRICE_PER_M2 = null;

// Ceny konkrétních pozemků v Kč, přebíjí PRICE_PER_M2. Např. { "01": 4290000 }
export const PRICE_OVERRIDE = {};

// Stav pozemků. Výchozí je volný. Hodnoty: "rezervace" | "prodano"
// Např. { "05": "rezervace", "12": "prodano" }
export const STATUS = {};

export const CONTACT = {
  phone: "+420 123 456 789", // DOPLNIT
  email: "prodej@zakaplickou.cz", // DOPLNIT
};
