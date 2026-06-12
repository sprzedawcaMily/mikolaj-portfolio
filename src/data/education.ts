export interface EducationItem {
  id: string;
  school: string;
  location: string;
  degree: string;
  period: string;
  form: string;
  highlights: string[];
}

export const education: EducationItem[] = [
  {
    id: 'lazarski',
    school: 'Uczelnia Łazarskiego',
    location: 'Warszawa',
    degree: 'Administracja — specjalizacja Administrowanie Ruchem Dronów',
    period: 'X 2025 — obecnie',
    form: 'Studia I stopnia, niestacjonarne',
    highlights: [
      'Lazarski Aviation Academy — program lotniczy Uczelni Łazarskiego',
      'Prawo dronów, zarządzanie operacjami BSP, analiza ryzyk',
      'AI, IoT i analiza danych w kontekście przestrzeni powietrznej',
    ],
  },
  {
    id: 'lo-curie',
    school: 'I Liceum Ogólnokształcące im. Marii Skłodowskiej-Curie',
    location: 'Sokołów Podlaski',
    degree: 'Liceum ogólnokształcące — matura 2025',
    period: 'IX 2022 — V 2025',
    form: 'Egzamin maturalny',
    highlights: [
      'Rozszerzenia: fizyka, matematyka, język angielski',
      'Angielski — swobodna komunikacja w zespole międzynarodowym',
    ],
  },
];
