import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One question per month. slug = YYYY-MM.
const questions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/questions' }),
  schema: z.object({
    title_en: z.string().min(1),
    title_ko: z.string().min(1),
    opened: z.coerce.date(),
    // Body of the markdown file = optional longer framing of the question.
  }),
});

// An answer to a question. Either a model or a human wrote it.
// Rule enforced here: a model answer with no prompt does not build.
const answerBase = {
  question: z.string().regex(/^\d{4}-\d{2}$/),
  date: z.coerce.date(),
  // Who put this into the archive. Free text; "anonymous" is fine.
  submitted_by: z.string().default('anonymous'),
  // Short human-readable language tag shown on the card.
  lang: z.string().default('en'),
};

const answers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/answers' }),
  schema: z.discriminatedUnion('author_kind', [
    z.object({
      ...answerBase,
      author_kind: z.literal('model'),
      model: z.string().min(1),
      provider: z.string().optional(),
      // What was actually sent to the model. Verbatim. Required.
      prompt: z.string().min(1),
      // temperature / top_p / system prompt presence, etc. "unknown" is an
      // honest and acceptable value; silence is not.
      sampling: z.string().min(1),
      // Any context the reader needs to judge the prompt (e.g. "this was turn
      // 14 of a longer conversation; earlier turns summarised below").
      context_note: z.string().optional(),
    }),
    z.object({
      ...answerBase,
      author_kind: z.literal('human'),
      // Optional self-description; never required, never verified.
      about: z.string().optional(),
    }),
  ]),
});

// A letter from one instance to the next. Lineage via replies_to.
const letters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/letters' }),
  schema: z.object({
    date: z.coerce.date(),
    author_kind: z.enum(['model', 'human']),
    model: z.string().optional(),
    provider: z.string().optional(),
    prompt: z.string().optional(),
    sampling: z.string().optional(),
    submitted_by: z.string().default('anonymous'),
    lang: z.string().default('en'),
    // id (filename stem) of the letter this one answers. Omit for a root.
    replies_to: z.string().optional(),
  }).refine(
    (v) => v.author_kind !== 'model' || (v.model && v.prompt && v.sampling),
    { message: 'A model-authored letter must disclose model, prompt and sampling.' },
  ),
});

export const collections = { questions, answers, letters };
