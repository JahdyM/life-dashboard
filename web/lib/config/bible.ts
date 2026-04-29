export type BibleBookConfig = {
  key: string;
  name: string;
  chapters: number;
};

export type BibleSectionConfig = {
  title: string;
  books: BibleBookConfig[];
};

const book = (key: string, name: string, chapters: number): BibleBookConfig => ({
  key,
  name,
  chapters,
});

export const BIBLE_SECTIONS: BibleSectionConfig[] = [
  {
    title: "Pentateuco",
    books: [
      book("genesis", "Gênesis", 50),
      book("exodus", "Êxodo", 40),
      book("leviticus", "Levítico", 27),
      book("numbers", "Números", 36),
      book("deuteronomy", "Deuteronômio", 34),
    ],
  },
  {
    title: "Terra Prometida",
    books: [book("joshua", "Josué", 24), book("judges", "Juízes", 21), book("ruth", "Rute", 4)],
  },
  {
    title: "Reis do Israel antigo",
    books: [
      book("1_samuel", "1 Samuel", 31),
      book("2_samuel", "2 Samuel", 24),
      book("1_kings", "1 Reis", 22),
      book("2_kings", "2 Reis", 25),
      book("1_chronicles", "1 Crônicas", 29),
      book("2_chronicles", "2 Crônicas", 36),
    ],
  },
  {
    title: "Retorno do exílio",
    books: [book("ezra", "Esdras", 10), book("nehemiah", "Neemias", 13), book("esther", "Ester", 10)],
  },
  {
    title: "História de Jó",
    books: [book("job", "Jó", 42)],
  },
  {
    title: "Cânticos e sabedoria prática",
    books: [
      book("psalms", "Salmos", 150),
      book("proverbs", "Provérbios", 31),
      book("ecclesiastes", "Eclesiastes", 12),
      book("song_of_solomon", "Cântico de Salomão", 8),
    ],
  },
  {
    title: "Livros proféticos",
    books: [
      book("isaiah", "Isaías", 66),
      book("jeremiah", "Jeremias", 52),
      book("lamentations", "Lamentações", 5),
      book("ezekiel", "Ezequiel", 48),
      book("daniel", "Daniel", 12),
      book("hosea", "Oseias", 14),
      book("joel", "Joel", 3),
      book("amos", "Amós", 9),
      book("obadiah", "Obadias", 1),
      book("jonah", "Jonas", 4),
      book("micah", "Miqueias", 7),
      book("nahum", "Naum", 3),
      book("habakkuk", "Habacuque", 3),
      book("zephaniah", "Sofonias", 3),
      book("haggai", "Ageu", 2),
      book("zechariah", "Zacarias", 14),
      book("malachi", "Malaquias", 4),
    ],
  },
  {
    title: "Vida e ministério de Jesus",
    books: [
      book("matthew", "Mateus", 28),
      book("mark", "Marcos", 16),
      book("luke", "Lucas", 24),
      book("john", "João", 21),
    ],
  },
  {
    title: "Crescimento da congregação cristã",
    books: [book("acts", "Atos", 28)],
  },
  {
    title: "Cartas do apóstolo Paulo",
    books: [
      book("romans", "Romanos", 16),
      book("1_corinthians", "1 Coríntios", 16),
      book("2_corinthians", "2 Coríntios", 13),
      book("galatians", "Gálatas", 6),
      book("ephesians", "Efésios", 6),
      book("philippians", "Filipenses", 4),
      book("colossians", "Colossenses", 4),
      book("1_thessalonians", "1 Tessalonicenses", 5),
      book("2_thessalonians", "2 Tessalonicenses", 3),
      book("1_timothy", "1 Timóteo", 6),
      book("2_timothy", "2 Timóteo", 4),
      book("titus", "Tito", 3),
      book("philemon", "Filêmon", 1),
      book("hebrews", "Hebreus", 13),
    ],
  },
  {
    title: "Escritos de outros apóstolos e discípulos",
    books: [
      book("james", "Tiago", 5),
      book("1_peter", "1 Pedro", 5),
      book("2_peter", "2 Pedro", 3),
      book("1_john", "1 João", 5),
      book("2_john", "2 João", 1),
      book("3_john", "3 João", 1),
      book("jude", "Judas", 1),
      book("revelation", "Apocalipse", 22),
    ],
  },
];

export const BIBLE_BOOKS = BIBLE_SECTIONS.flatMap((section) => section.books);
export const BIBLE_TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((sum, item) => sum + item.chapters, 0);
export const BIBLE_BOOK_BY_KEY = new Map(BIBLE_BOOKS.map((item) => [item.key, item]));
