// Direct port of the web app's NZ_REGIONS dataset (app.js) — region ->
// district -> areas, used by the tradie onboarding wizard's Service Areas
// step. Kept as a single source so both apps could theoretically import the
// same JSON later; for now it's just copied verbatim to avoid a mobile
// build depending on the (read-only, per project rules) web repo.
export type NzDistrict = { district: string; areas: string[] };
export type NzRegions = Record<string, NzDistrict[]>;

export const NZ_REGIONS: NzRegions = {
  Auckland: [
    { district: 'North Shore', areas: ['Albany', 'Takapuna', 'Glenfield', 'Browns Bay', 'Devonport', 'Birkenhead', 'Northcote', 'Milford', 'Torbay', 'Long Bay', 'Mairangi Bay', 'Forrest Hill', 'Beach Haven'] },
    { district: 'West Auckland', areas: ['Henderson', 'New Lynn', 'Massey', 'Te Atatū', 'Glen Eden', 'Titirangi', 'Kelston', 'Ranui', 'Swanson', 'Kumeū'] },
    { district: 'Central Auckland', areas: ['Mt Eden', 'Epsom', 'Ponsonby', 'Newmarket', 'Grey Lynn', 'Mt Albert', 'Sandringham', 'Kingsland', 'Parnell', 'Remuera', 'Ellerslie', 'Onehunga', 'Grafton', 'Mission Bay', 'St Heliers'] },
    { district: 'East Auckland', areas: ['Botany', 'Pakuranga', 'Howick', 'Half Moon Bay', 'Bucklands Beach', 'East Tāmaki', 'Flat Bush', 'Highland Park'] },
    { district: 'South Auckland', areas: ['Manukau', 'Papatoetoe', 'Papakura', 'Takanini', 'Ōtāhuhu', 'Māngere', 'Ōtara', 'Manurewa', 'Clendon', 'Māngere Bridge'] },
    { district: 'Rodney', areas: ['Orewa', 'Silverdale', 'Pukekohe', 'Warkworth', 'Helensville', 'Snells Beach', 'Waiuku', 'Wellsford'] },
  ],
  Waikato: [
    { district: 'Hamilton', areas: ['Rototuna', 'Chartwell', 'Hillcrest', 'Frankton', 'Dinsdale', 'Nawton', 'Glenview', 'Melville', 'Flagstaff', 'Fairfield', 'Hamilton East', 'St Andrews', 'Beerescourt'] },
    { district: 'Cambridge', areas: ['Leamington', 'Hautapu'] },
    { district: 'Te Awamutu', areas: ['Kihikihi'] },
    { district: 'Huntly', areas: ['Huntly West'] },
  ],
  'Bay of Plenty': [
    { district: 'Tauranga', areas: ['Mount Maunganui', 'Papamoa', 'Bethlehem', 'Greerton', 'Welcome Bay', 'Gate Pā', 'Otumoetai', 'Judea', 'Matua', 'Brookfield', 'Bellevue', 'Pyes Pā', 'Tauriko', 'Merivale', 'Arataki', 'Ohauiti'] },
    { district: 'Rotorua', areas: ['Ngongotahā', 'Fenton Park', 'Lynmore', 'Fairy Springs', 'Glenholme', 'Springfield', 'Koutu', 'Victoria'] },
    { district: 'Whakatāne', areas: ['Ōhope', 'Whakatāne Central'] },
    { district: 'Katikati', areas: ['Katikati Central', 'Aongatete'] },
    { district: 'Te Puke', areas: ['Te Puke Central'] },
  ],
  Wellington: [
    { district: 'Wellington City', areas: ['Te Aro', 'Newtown', 'Karori', 'Johnsonville', 'Miramar', 'Island Bay', 'Kelburn', 'Brooklyn', 'Mount Victoria', 'Kilbirnie', 'Khandallah', 'Ngaio', 'Wadestown', 'Berhampore'] },
    { district: 'Lower Hutt', areas: ['Petone', 'Wainuiomata', 'Stokes Valley', 'Naenae', 'Taitā', 'Alicetown', 'Epuni', 'Waterloo', 'Eastbourne'] },
    { district: 'Porirua', areas: ['Whitby', 'Tītahi Bay', 'Cannons Creek', 'Elsdon', 'Aotea'] },
    { district: 'Upper Hutt', areas: ['Trentham', 'Heretaunga', 'Wallaceville'] },
    { district: 'Kāpiti Coast', areas: ['Paraparaumu', 'Waikanae', 'Raumati'] },
  ],
  Canterbury: [
    { district: 'Christchurch', areas: ['Riccarton', 'Hornby', 'Papanui', 'Halswell', 'Fendalton', 'Sumner', 'New Brighton', 'Merivale', 'Addington', 'Sydenham', 'Redwood', 'Shirley', 'Linwood', 'Cashmere', 'Ilam'] },
    { district: 'Ashburton', areas: ['Tinwald'] },
    { district: 'Timaru', areas: ['Highfield', 'Marchwiel'] },
    { district: 'Rangiora', areas: ['Kaiapoi', 'Woodend'] },
  ],
  Otago: [
    { district: 'Dunedin', areas: ['Mosgiel', 'St Clair', 'Mornington', 'North East Valley', 'Andersons Bay', 'Roslyn', 'Kaikorai', 'St Kilda', 'Green Island', 'Port Chalmers'] },
    { district: 'Queenstown', areas: ['Frankton', 'Arrowtown', 'Fernhill'] },
    { district: 'Wanaka', areas: ['Albert Town'] },
  ],
  Southland: [
    { district: 'Invercargill', areas: ['Windsor', 'Glengarry', 'Waikiwi', 'Georgetown', 'Otatara', 'Rosedale', 'Gladstone'] },
    { district: 'Gore', areas: ['Mataura'] },
  ],
  "Hawke's Bay": [
    { district: 'Napier', areas: ['Taradale', 'Ahuriri', 'Greenmeadows', 'Marewa', 'Onekawa', 'Bluff Hill', 'Maraenui'] },
    { district: 'Hastings', areas: ['Havelock North', 'Flaxmere', 'Mahora', 'Camberley', 'Frimley', 'Parkvale'] },
  ],
  Taranaki: [
    { district: 'New Plymouth', areas: ['Bell Block', 'Fitzroy', 'Westown', 'Merrilands', 'Vogeltown', 'Strandon', 'Highlands Park', 'Waitara'] },
    { district: 'Hāwera', areas: ['Hāwera Central'] },
    { district: 'Stratford', areas: ['Stratford Central'] },
  ],
  'Manawatū-Whanganui': [
    { district: 'Palmerston North', areas: ['Roslyn', 'Hokowhitu', 'Awapuni', 'Kelvin Grove', 'Highbury', 'Milson', 'Ashhurst', 'Terrace End'] },
    { district: 'Whanganui', areas: ['Castlecliff', 'Gonville', 'Aramoho', 'St Johns Hill'] },
    { district: 'Feilding', areas: ['Feilding Central'] },
  ],
  Nelson: [{ district: 'Nelson', areas: ['Stoke', 'Tahunanui', 'Richmond', 'Atawhai', 'The Wood', 'Britannia Heights'] }],
  Marlborough: [
    { district: 'Blenheim', areas: ['Springlands', 'Redwoodtown', 'Riversdale', 'Witherlea'] },
    { district: 'Picton', areas: ['Picton Central', 'Waikawa'] },
  ],
  Northland: [
    { district: 'Whangārei', areas: ['Kamo', 'Tikipunga', 'Onerahi', 'Regent', 'Morningside', 'Raumanga'] },
    { district: 'Kerikeri', areas: ['Waipapa'] },
    { district: 'Kaitaia', areas: ['Kaitaia Central'] },
    { district: 'Dargaville', areas: ['Dargaville Central'] },
  ],
  Gisborne: [{ district: 'Gisborne', areas: ['Elgin', 'Mangapapa', 'Kaiti', 'Whataupoko', 'Te Hapara', 'Wainui'] }],
  Tasman: [
    { district: 'Richmond', areas: ['Motueka', 'Mapua', 'Wakefield', 'Brightwater'] },
    { district: 'Golden Bay', areas: ['Takaka'] },
  ],
  'West Coast': [
    { district: 'Greymouth', areas: ['Cobden', 'Runanga', 'Karoro'] },
    { district: 'Westport', areas: ['Westport Central'] },
    { district: 'Hokitika', areas: ['Hokitika Central'] },
  ],
};
