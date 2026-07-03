const DRINK_RECIPES = {
  'espresso martini': ['Vodka', 'Kahlúa (kaffelikør)', 'Friskbrygget espresso', 'Sukkersirup'],
  'mojito': ['Hvid rom', 'Frisk lime', 'Sukker', 'Frisk mynte', 'Sodavand'],
  'moscow mule': ['Vodka', 'Ingefærøl', 'Lime'],
  'gin tonic': ['Gin', 'Tonic water', 'Lime'],
  'gin and tonic': ['Gin', 'Tonic water', 'Lime'],
  'cuba libre': ['Rom', 'Cola', 'Lime'],
  'whiskey sour': ['Whiskey', 'Citronsaft', 'Sukkersirup', 'Æggehvide (valgfri)'],
  'old fashioned': ['Whiskey/bourbon', 'Sukkerknald', 'Angostura bitter', 'Appelsinskal'],
  'margarita': ['Tequila', 'Triple sec', 'Limesaft', 'Salt til kanten'],
  'daiquiri': ['Hvid rom', 'Limesaft', 'Sukkersirup'],
  'pina colada': ['Hvid rom', 'Kokoscreme', 'Ananasjuice'],
  'negroni': ['Gin', 'Rød vermouth', 'Campari'],
  'aperol spritz': ['Aperol', 'Prosecco', 'Sodavand', 'Appelsinskive'],
  'white russian': ['Vodka', 'Kahlúa (kaffelikør)', 'Fløde'],
  'black russian': ['Vodka', 'Kahlúa (kaffelikør)'],
  'long island iced tea': ['Vodka', 'Gin', 'Hvid rom', 'Tequila', 'Triple sec', 'Citronsaft', 'Cola'],
  'bloody mary': ['Vodka', 'Tomatjuice', 'Worcestershiresauce', 'Tabasco', 'Citronsaft', 'Salt & peber'],
  'cosmopolitan': ['Vodka', 'Triple sec', 'Tranebærjuice', 'Limesaft'],
  'manhattan': ['Rugwhiskey', 'Rød vermouth', 'Angostura bitter'],
  'tequila sunrise': ['Tequila', 'Appelsinjuice', 'Grenadine'],
  'jagerbomb': ['Jägermeister', 'Energidrik'],
  'rusty nail': ['Whiskey', 'Drambuie'],
  'dark and stormy': ['Mørk rom', 'Ingefærøl', 'Lime'],
  'sex on the beach': ['Vodka', 'Fersken-likør', 'Appelsinjuice', 'Tranebærjuice'],
  'caipirinha': ['Cachaça', 'Lime', 'Sukker'],
  'mai tai': ['Hvid rom', 'Mørk rom', 'Triple sec', 'Limesaft', 'Orgeat/mandelsirup'],
  'french 75': ['Gin', 'Citronsaft', 'Sukkersirup', 'Champagne/mousserende vin'],
  'gin fizz': ['Gin', 'Citronsaft', 'Sukkersirup', 'Sodavand'],
  'irish coffee': ['Irsk whiskey', 'Kaffe', 'Brun farin', 'Piskefløde'],
  'amaretto sour': ['Amaretto', 'Citronsaft', 'Sukkersirup'],
  'kir royal': ['Champagne/mousserende vin', 'Solbærlikør (Crème de Cassis)'],
  'mimosa': ['Champagne/mousserende vin', 'Appelsinjuice'],
  'sangria': ['Rødvin', 'Appelsinjuice', 'Frugt (æble, appelsin)', 'Brandy', 'Sodavand'],
};

function normalizeDrinkName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupDrinkRecipe(name) {
  const key = normalizeDrinkName(name);
  if (DRINK_RECIPES[key]) return DRINK_RECIPES[key].slice();
  const noSpace = key.replace(/ /g, '');
  const foundKey = Object.keys(DRINK_RECIPES).find((k) => k.replace(/ /g, '') === noSpace);
  return foundKey ? DRINK_RECIPES[foundKey].slice() : null;
}
