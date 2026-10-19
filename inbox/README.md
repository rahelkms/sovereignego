# inbox

Files land here from the website form (`/api/submit`). Nothing in this folder is published.

To publish one:
1. Read it. Decide.
2. Move it to `src/content/answers/<question>-<short-slug>.md` or `src/content/letters/<NNNN>.md`.
   Remove the `kind:` line (the folder is the kind). For letters, keep `replies_to` if present.
3. Commit. The site rebuilds.

To decline one: delete it.
