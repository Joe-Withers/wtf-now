# 024: Deploy for real

**Depends on:** 017

Run the Docker Compose deployment on a VPS, put it behind Tailscale, and point the bundle at a private git remote. Prove the whole thing survives a lost server: rebuild on a second machine, clone the bundle from the remote, and carry on from the same state.

**Done when:** the app opens on the owner's phone over Tailscale, and a rebuilt server comes up with the same tasks, notes and history.

**Status:** the files exist and the plan is written down in `docs/deployment.md`, but nothing has been deployed. This needs a VPS, a private remote for the bundle, and Tailscale on the owner's phone.
