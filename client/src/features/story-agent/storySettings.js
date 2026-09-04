import {
  BookOpen,
  Cake,
  Feather,
  Film,
  GraduationCap,
  Heart,
  Mail,
  Moon,
  PawPrint,
  Rocket,
  Search,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';

/**
 * Option lists for the Book Settings sheet.
 *
 * AGE_GROUPS must stay in step with the server enum in
 * `server/src/models/enums.js` — a value the server rejects would surface as a
 * validation error the user cannot fix from the UI.
 */
export const AGE_GROUPS = [
  { value: '0-3', label: '0–3 years' },
  { value: '3-5', label: '3–5 years' },
  { value: '6-9', label: '6–9 years' },
  { value: '9-12', label: '9–12 years' },
  { value: '13-17', label: 'Teens (13–17)' },
  { value: '18+', label: 'Adults (18+)' },
];

export const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Japanese'];

/**
 * Genres span the whole shelf now, not only the nursery: the first block is the
 * children's set, the rest carry the book into teen and adult territory. Genre
 * is a free-form string on the server, so this list only shapes the picker — a
 * value not on it is still valid.
 */
export const GENRES = [
  'Magical Adventure',
  'Bedtime',
  'Friendship',
  'Animal Tales',
  'Learning',
  'Adventure',
  'Fantasy',
  'Science Fiction',
  'Mystery',
  'Thriller',
  'Romance',
  'Historical',
  'Horror',
  'Folktale & Myth',
  'Poetry',
  'Comedy',
  'Slice of Life',
  'Biography & Memoir',
  'Non-fiction',
];

export const ART_STYLES = [
  '3D Storybook',
  'Watercolour',
  'Illustrated Realism',
  'Flat Vector',
  'Paper Cut',
  'Cinematic',
  'Graphic Novel',
  'Manga',
  'Ink & Wash',
  'Oil Painting',
  'Noir',
  'Vintage',
  'Minimalist',
];

export const PAGE_COUNTS = [6, 8, 10, 12, 16, 20, 24];

/**
 * The six starters drawn on the agent screen. The design renders each with an
 * emoji; Lucide icons are used instead, per the project's icon rule.
 */
export const SUGGESTIONS = [
  { id: 'bedtime', icon: Moon, label: 'Create a magical bedtime story', prompt: 'Create a magical bedtime story that ends somewhere calm and safe.' },
  { id: 'friendship', icon: Sparkles, label: 'Write an adventure about friendship', prompt: 'Write an adventure about two friends who learn what courage means.' },
  { id: 'birthday', icon: Cake, label: 'Make a personalized birthday book', prompt: 'Make a personalised birthday book for a child who is turning seven.' },
  { id: 'animals', icon: BookOpen, label: 'Create an educational animal story', prompt: 'Create an educational story that teaches a child about animals and their habitats.' },
  { id: 'ten-page', icon: GraduationCap, label: 'Turn my idea into a 10-page book', prompt: 'Turn my idea into a ten-page picture book: ' },
  { id: 'upload', icon: Upload, label: 'Upload and illustrate my story', prompt: 'Illustrate this story I have already written: ' },
];

/**
 * Ready-made book recipes shown under the composer on the agent screen.
 *
 * A template is a starter with the shape of the book decided too: choosing one
 * seeds the idea *and* the Book Settings, so a whole kind of book is one click
 * away rather than a form to fill. `settings` is merged over whatever the author
 * already has, so a template only moves the dials it names.
 *
 * The shelf spans the whole product now, not just the nursery: it runs from
 * picture books for toddlers to illustrated mysteries, sci-fi, romance, poetry
 * and memoir for teens and adults. They are interleaved by audience on purpose,
 * so the row reads as "every kind of book" rather than "the children's ones,
 * then the grown-up ones".
 *
 * `ageGroup` must be a member of AGE_GROUPS (the server validates it). `genre`
 * and `artStyle` are free-form on the server, so they may be anything readable;
 * keeping them in step with GENRES / ART_STYLES just means the Book Settings
 * picker shows the same words back.
 *
 * `cover` is a lettered cover illustration under `public/templates/`, so a
 * template reads as a book on the shelf, the same way a finished book does. The
 * title is drawn into the artwork, so the card does not print it again. `icon`
 * is kept as the fallback the card shows before the cover paints.
 */
export const TEMPLATES = [
  {
    id: 'bedtime-wonder',
    icon: Moon,
    cover: '/templates/bedtime-wonder.svg',
    title: 'Bedtime Wonder',
    description: 'A soft, slow story that drifts to a calm and safe ending.',
    prompt:
      'Create a soothing bedtime story with a gentle, sleepy rhythm that ends somewhere calm and safe.',
    settings: { genre: 'Bedtime', artStyle: 'Watercolour', ageGroup: '3-5', pageCount: 8, moral: 'Feeling safe and loved' },
  },
  {
    id: 'starbound',
    icon: Rocket,
    cover: '/templates/starbound.svg',
    title: 'Starbound',
    description: 'A young explorer ventures beyond the stars and finds what home really means.',
    prompt:
      'Write an illustrated science-fiction story about a young explorer who ventures beyond the stars and finds something that changes home forever.',
    settings: { genre: 'Science Fiction', artStyle: 'Cinematic', ageGroup: '13-17', pageCount: 16, moral: 'Hope carried across the stars' },
  },
  {
    id: 'brave-friends',
    icon: Heart,
    cover: '/templates/brave-friends.svg',
    title: 'Brave Friends',
    description: 'Two friends set out together and discover what courage really means.',
    prompt:
      'Write an adventure about two friends who learn what courage means when they help each other.',
    settings: { genre: 'Friendship', artStyle: '3D Storybook', ageGroup: '6-9', pageCount: 10, moral: 'Courage and standing by a friend' },
  },
  {
    id: 'the-midnight-case',
    icon: Search,
    cover: '/templates/the-midnight-case.svg',
    title: 'The Midnight Case',
    description: 'An atmospheric mystery where nothing is quite what it seems.',
    prompt:
      'Write an atmospheric illustrated mystery for adults: a detective works a rain-soaked case where every answer opens another question.',
    settings: { genre: 'Mystery', artStyle: 'Noir', ageGroup: '18+', pageCount: 20, moral: 'The truth beneath the surface' },
  },
  {
    id: 'animal-explorers',
    icon: PawPrint,
    cover: '/templates/animal-explorers.svg',
    title: 'Animal Explorers',
    description: 'Meet playful animals and the wild habitats they call home.',
    prompt:
      'Create an educational story that introduces a child to animals and the habitats where they live.',
    settings: { genre: 'Animal Tales', artStyle: 'Illustrated Realism', ageGroup: '6-9', pageCount: 12, moral: 'Curiosity about the natural world' },
  },
  {
    id: 'paper-hearts',
    icon: Mail,
    cover: '/templates/paper-hearts.svg',
    title: 'Paper Hearts',
    description: 'A tender romance drawn out across a year of letters.',
    prompt:
      'Write a tender illustrated romance for adults about two people whose letters draw them together across a single unforgettable year.',
    settings: { genre: 'Romance', artStyle: 'Watercolour', ageGroup: '18+', pageCount: 16, moral: 'Love, and the courage to say it' },
  },
  {
    id: 'magical-kingdom',
    icon: Wand2,
    cover: '/templates/magical-kingdom.svg',
    title: 'Magical Kingdom',
    description: 'A sweeping adventure through an enchanted land of wonder.',
    prompt:
      'Write a magical adventure through an enchanted kingdom, full of wonder and a kind-hearted hero.',
    settings: { genre: 'Magical Adventure', artStyle: '3D Storybook', ageGroup: '9-12', pageCount: 16, moral: 'Kindness and wonder' },
  },
  {
    id: 'verses-and-light',
    icon: Feather,
    cover: '/templates/verses-and-light.svg',
    title: 'Verses & Light',
    description: 'A collection of short poems, each paired with its own image.',
    prompt:
      'Create an illustrated collection of short poems, each paired with its own image, about the quiet moments that hold a life together.',
    settings: { genre: 'Poetry', artStyle: 'Minimalist', ageGroup: '13-17', pageCount: 12, moral: 'Finding light in small things' },
  },
  {
    id: 'birthday-surprise',
    icon: Cake,
    cover: '/templates/birthday-surprise.svg',
    title: 'Birthday Surprise',
    description: 'A personalised birthday tale that stars the birthday child.',
    prompt:
      'Make a personalised birthday book for a child, full of surprises and a happy celebration at the end.',
    settings: { genre: 'Adventure', artStyle: 'Flat Vector', ageGroup: '6-9', pageCount: 10, moral: 'Feeling celebrated' },
  },
  {
    id: 'a-life-in-frames',
    icon: Film,
    cover: '/templates/a-life-in-frames.svg',
    title: 'A Life in Frames',
    description: 'An illustrated memoir that tells one remarkable life, decade by decade.',
    prompt:
      'Write an illustrated memoir that tells the story of one remarkable life across the decades, one defining moment per page.',
    settings: { genre: 'Biography & Memoir', artStyle: 'Vintage', ageGroup: '18+', pageCount: 20, moral: 'A life, remembered' },
  },
  {
    id: 'little-learner',
    icon: GraduationCap,
    cover: '/templates/little-learner.svg',
    title: 'Little Learner',
    description: 'A playful story that teaches one simple idea, gently.',
    prompt:
      'Create a playful learning story for a young child that teaches one simple idea in a fun way.',
    settings: { genre: 'Learning', artStyle: 'Paper Cut', ageGroup: '3-5', pageCount: 8, moral: 'Learning something new' },
  },
];

export const DEFAULT_SETTINGS = {
  ageGroup: '6-9',
  language: 'English',
  genre: 'Magical Adventure',
  artStyle: '3D Storybook',
  pageCount: 10,
  moral: '',
};

export default { AGE_GROUPS, LANGUAGES, GENRES, ART_STYLES, PAGE_COUNTS, SUGGESTIONS, TEMPLATES, DEFAULT_SETTINGS };
