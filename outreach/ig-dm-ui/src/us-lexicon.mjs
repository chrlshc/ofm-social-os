export const US_STATES = [
  // abréviations courantes
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'
];

export const US_CITIES = [
  'new york','nyc','los angeles','la','miami','chicago','houston','dallas','austin','phoenix','philadelphia',
  'san antonio','san diego','san francisco','sf','seattle','denver','atlanta','vegas','boston',
  'orlando','tampa','nashville','charlotte','portland','detroit','minneapolis'
];

export function inferTimezoneFromText(t) {
  const s = t.toLowerCase();
  if (/(ny|new york|miami|boston|philly|atlanta|orlando|tampa|dc)/.test(s)) return 'ET';
  if (/(chicago|houston|dallas|austin|nashville|detroit|minneapolis)/.test(s)) return 'CT';
  if (/(denver)/.test(s)) return 'MT';
  if (/(la\b|los angeles|san diego|san francisco|sf|seattle|portland|vegas)/.test(s)) return 'PT';
  return null;
}

export function isUSLike(text='') {
  const s = text.toUpperCase();
  if (US_STATES.some(abbr => new RegExp(`\\b${abbr}\\b`).test(s))) return true;
  const low = text.toLowerCase();
  if (US_CITIES.some(c => low.includes(c))) return true;
  if (/\busa\b|\bamerica(n)?\b|united states/.test(low)) return true;
  return false;
}