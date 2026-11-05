# 034: A layout that fits the screen

**Depends on**: 033

The app was a phone-shaped column: 720 pixels wide, centred in the window, with the rest of the screen empty either side. On a laptop that reads as a small app floating in a big empty page, which is the wrong shape for a screen you sit in front of.

The app now fills the window, and the content adapts to it:

- The navigation is an icon rail on a phone and a proper sidebar, with the wordmark at the top, on a laptop.
- Reading screens keep a comfortable measure — about 880 pixels — centred in whatever space there is, so a paragraph never runs the width of a monitor.
- Lists of cards go two abreast when there's room for two decent columns, instead of one long thin stack.
- The screens that draw something — the graph, What now — use the whole width.

Nothing changes on a phone: one column, the icon rail, the same screens.

**Done when**: the app fills the window on a laptop and still reads on a phone.
