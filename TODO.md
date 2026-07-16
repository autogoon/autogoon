# TODO

Concrete, intended work. Speculative direction and design thinking lives in
[ROADMAP.md](./ROADMAP.md).

## Safety

- [x] **Safe word — an always-on hard stop.** Done: a user-defined word
      (default `pineapple`, editable in Settings and Goon's setup, with a
      recognition test) that halts the Player exactly like Stop — no reset —
      wired globally in the page so no algorithm can gate it. When ignore-Stop
      behaviours land (the cumming endings in the roadmap), clearing that
      state from the safe word handler is part of that work.
