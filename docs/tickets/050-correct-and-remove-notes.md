# 050: Correct and remove notes

**Depends on**: 049

A note was wrong, so the owner told the chat the right figures. The AI wrote a second note with the same title instead of correcting the first, said the earlier one "has been removed" when it hadn't, and there was no way to get rid of either: the AI had no tool to delete a note and neither did the API.

Now:

- Writing a note with the title of one that exists replaces it, so a correction can't leave a copy behind. This holds even when the AI forgets to give the slug.
- A note can be deleted. The AI proposes it like any other structural change, so the owner approves the removal on a card, and it can be undone. The REST API has `DELETE /api/notes/{slug}` on the same write path.
- The AI is told to correct a note by rewriting it, to propose deleting a wrong or duplicate one, and never to say it removed something unless a tool call did.

Drawings can't be deleted yet; they are an SVG as well as a file, and the same duplicate can't arise because the AI replaces a drawing by slug.

**Done when**: a wrong note can be corrected without a copy, and removed on the owner's say-so.
