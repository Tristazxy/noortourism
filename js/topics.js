// The fixed list of feedback topics. The classifier can only answer with one of these
// (or "other / not sure"), so every output can be checked. Names are human-written.
//
// sw:   what Noor sees (Swahili)
// en:   English label (for the helper / guide / judges)
// msg:  short phrase used inside a thank-you message, per language
// proto: example English sentences the on-device embedding model compares against

export const TOPICS = [
  {
    id: 'coffee',
    sw: 'Kuandaa kahawa (kukaanga, kusaga, kuonja)',
    en: 'Coffee making (roasting, grinding, tasting)',
    msg: {
      sw: 'kuandaa kahawa pamoja', en: 'making coffee together', it: 'preparare il caffè insieme',
      fr: 'la préparation du café ensemble', de: 'die gemeinsame Kaffeezubereitung', zh: '一起制作咖啡',
      es: 'preparar café juntos', pl: 'wspólne przygotowywanie kawy',
    },
    proto: [
      'making coffee by hand', 'roasting and grinding the coffee beans', 'tasting the fresh coffee we made ourselves',
      'learning how coffee is grown and processed', 'the coffee was delicious', 'grinding coffee while singing',
    ],
  },
  {
    id: 'walk',
    sw: 'Matembezi shambani na mandhari',
    en: 'Farm walk and scenery',
    msg: {
      sw: 'matembezi shambani na mandhari', en: 'the farm walk and the views', it: 'la passeggiata nella fattoria e il paesaggio',
      fr: 'la balade dans la ferme et les paysages', de: 'der Spaziergang über die Farm und die Aussicht', zh: '农场漫步和风景',
      es: 'el paseo por la finca y el paisaje', pl: 'spacer po farmie i widoki',
    },
    proto: [
      'the walk through the farm', 'beautiful views of the mountain and the waterfall', 'walking among banana and coffee trees',
      'the hike was lovely', 'nature and scenery', 'the path was steep and slippery',
    ],
  },
  {
    id: 'food',
    sw: 'Chakula',
    en: 'Food and lunch',
    msg: {
      sw: 'chakula cha mchana', en: 'the lunch', it: 'il pranzo', fr: 'le déjeuner', de: 'das Mittagessen',
      zh: '午餐', es: 'la comida', pl: 'obiad',
    },
    proto: [
      'the lunch was delicious', 'traditional local food', 'the meal we ate', 'tasting banana beer',
      'we would like more vegetarian food', 'the food portions were small',
    ],
  },
  {
    id: 'host',
    sw: 'Ukarimu na hadithi za familia',
    en: 'Hospitality and stories',
    msg: {
      sw: 'ukarimu wetu na hadithi za familia', en: 'our hospitality and family stories',
      it: 'la nostra ospitalità e le storie di famiglia', fr: 'notre accueil et les histoires de famille',
      de: 'unsere Gastfreundschaft und die Familiengeschichten', zh: '我们的热情招待和家族故事',
      es: 'nuestra hospitalidad y las historias familiares', pl: 'nasza gościnność i rodzinne historie',
    },
    proto: [
      'the family was so welcoming', 'the host was very kind and warm', 'stories about local culture and history',
      'songs and dances', 'warm hospitality', 'we felt at home',
    ],
  },
  {
    id: 'explain',
    sw: 'Maelezo na lugha',
    en: 'Explanations and language',
    msg: {
      sw: 'maelezo', en: 'the explanations', it: 'le spiegazioni', fr: 'les explications', de: 'die Erklärungen',
      zh: '讲解', es: 'las explicaciones', pl: 'objaśnienia',
    },
    proto: [
      'the explanations were clear and interesting', 'it was hard to understand because of the language',
      'the guide translated everything', 'we could not communicate with the host', 'we wanted more information about the process',
    ],
  },
  {
    id: 'price',
    sw: 'Bei',
    en: 'Price and value',
    msg: {
      sw: 'bei', en: 'the value for money', it: 'il rapporto qualità-prezzo', fr: 'le rapport qualité-prix',
      de: 'das Preis-Leistungs-Verhältnis', zh: '性价比', es: 'la relación calidad-precio', pl: 'stosunek jakości do ceny',
    },
    proto: ['the price was fair', 'it was too expensive', 'good value for money', 'the tour costs a lot of money', 'how to pay'],
  },
  {
    id: 'access',
    sw: 'Usafiri na njia ya kufika',
    en: 'Getting there',
    msg: {
      sw: 'safari ya kufika hapa', en: 'the journey here', it: 'il viaggio fino a noi', fr: 'le trajet jusqu’à chez nous',
      de: 'die Anreise', zh: '来这里的交通', es: 'el camino hasta aquí', pl: 'dojazd',
    },
    proto: [
      'the road to the farm was bad', 'it was hard to find the place', 'the drive from town', 'directions and signs',
      'transport and pickup',
    ],
  },
  {
    id: 'facilities',
    sw: 'Vyoo, maji na usafi',
    en: 'Toilets, water, cleanliness',
    msg: {
      sw: 'huduma za hapa', en: 'the facilities', it: 'i servizi', fr: 'les installations', de: 'die Einrichtungen',
      zh: '设施', es: 'las instalaciones', pl: 'udogodnienia',
    },
    proto: [
      'the toilet was dirty', 'a clean bathroom', 'there was no place to wash our hands', 'drinking water',
      'more seats and shade are needed',
    ],
  },
  {
    id: 'buy',
    sw: 'Kununua bidhaa (kahawa, zawadi)',
    en: 'Wanting to buy products',
    msg: {
      sw: 'kahawa ya kupeleka nyumbani', en: 'the coffee to take home', it: 'il caffè da portare a casa',
      fr: 'le café à emporter', de: 'der Kaffee zum Mitnehmen', zh: '可以带回家的咖啡',
      es: 'el café para llevar a casa', pl: 'kawa do zabrania do domu',
    },
    proto: [
      'I wanted to buy coffee beans to take home', 'we would buy a bag of roasted coffee', 'souvenirs for sale',
      'I wish we could buy the coffee', 'selling ground coffee to visitors',
    ],
  },
  {
    id: 'timing',
    sw: 'Muda wa ziara',
    en: 'Timing and pace',
    msg: {
      sw: 'mwendo wa ziara', en: 'the pace of the visit', it: 'i tempi della visita', fr: 'le rythme de la visite',
      de: 'das Tempo des Besuchs', zh: '参观的节奏', es: 'el ritmo de la visita', pl: 'tempo wizyty',
    },
    proto: [
      'the visit was too short', 'we waited too long', 'the tour started late', 'there was not enough time',
      'the schedule felt rushed',
    ],
  },
];

export const OTHER = {
  id: 'other',
  sw: 'Mengineyo — haijulikani, tafadhali angalia',
  en: 'Other — not sure, please check',
};

export function topicById(id) {
  return TOPICS.find(t => t.id === id) || OTHER;
}

// Product words in English (after translation) -> Swahili/English names.
// Deterministic keyword match: transparent and easy to correct.
export const PRODUCTS = [
  { id: 'coffee', sw: 'kahawa (maharagwe au unga)', en: 'coffee (beans or ground)', re: /\b(coffee beans?|roasted coffee|ground coffee|bag of coffee|coffee to (take|bring) home|buy (the |some )?coffee)\b/i },
  { id: 'souvenir', sw: 'zawadi na vinyago', en: 'souvenirs and crafts', re: /\b(souvenirs?|gifts?|crafts?|carvings?|handmade)\b/i },
  { id: 'honey', sw: 'asali', en: 'honey', re: /\bhoney\b/i },
  { id: 'beer', sw: 'mbege (pombe ya ndizi)', en: 'banana beer', re: /\bbanana beer\b/i },
  { id: 'class', sw: 'darasa la kupika', en: 'cooking class', re: /\bcooking (class|lesson)s?\b/i },
];

export function findProducts(englishText) {
  if (!englishText) return [];
  return PRODUCTS.filter(p => p.re.test(englishText)).map(p => p.id);
}

// Split English text into short clauses so "great coffee but dirty toilet" becomes two items.
export function splitClauses(text) {
  if (!text) return [];
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;])\s+|\n+/)
    .flatMap(s => s.split(/,?\s+\b(?:but|however|although|though)\b\s+/i))
    .map(s => s.trim().replace(/^[-•*]\s*/, ''))
    .filter(s => s.split(/\s+/).length >= 2);
}
