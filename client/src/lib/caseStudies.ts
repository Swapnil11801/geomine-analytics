export interface CaseStudy {
  id: string;
  name: string;
  country: string;
  description: string;
  coordinates: {
    lng: number;
    lat: number;
  };
  zoom: number;
  /** Precomputed results ship with the static demo (client/public/demo/<id>.json). */
  precomputed?: boolean;
}

export const caseStudies: CaseStudy[] = [
  {
    id: 'bingham-canyon',
    name: 'Bingham Canyon Mine',
    country: 'USA',
    description: 'One of the largest open-pit copper mines in the world, located in Utah.',
    coordinates: { lng: -112.148, lat: 40.522 },
    zoom: 12,
    precomputed: true,
  },
  {
    id: 'grasberg',
    name: 'Grasberg Mine',
    country: 'Indonesia',
    description: 'The largest gold mine and second-largest copper mine in the world.',
    coordinates: { lng: 137.112, lat: -4.053 },
    zoom: 12,
  },
  {
    id: 'chuquicamata',
    name: 'Chuquicamata Mine',
    country: 'Chile',
    description: 'The largest open pit copper mine by excavated volume.',
    coordinates: { lng: -68.903, lat: -22.288 },
    zoom: 12,
  },
  {
    id: 'hambach',
    name: 'Hambach Surface Mine',
    country: 'Germany',
    description: 'A large open-pit coal mine in North Rhine-Westphalia.',
    coordinates: { lng: 6.539, lat: 50.902 },
    zoom: 11,
    precomputed: true,
  },
  {
    id: 'mir-mine',
    name: 'Mir Diamond Mine',
    country: 'Russia',
    description: 'An open pit diamond mine, now inactive, in Mirny, Yakutia.',
    coordinates: { lng: 113.991, lat: 62.528 },
    zoom: 13,
  },
  {
    id: 'maddhapara',
    name: 'Maddhapara Granite Mine',
    country: 'Bangladesh',
    description: 'Underground granite mine at Maddhapara, Parbatipur, Dinajpur district.',
    coordinates: { lng: 89.065, lat: 25.566 },
    zoom: 14,
    precomputed: true,
  },
];
