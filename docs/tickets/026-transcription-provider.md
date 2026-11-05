# 026: Configure a transcription provider

**Depends on:** 021

Choose a provider for voice notes, set `STT_BASE_URL`, `STT_API_KEY` and `STT_MODEL` in `.env`, and turn the mic on. The provider is behind one interface, so swapping it is a configuration change.

**Done when:** a voice note recorded in the van comes back as text and drives a progress update.

**Status:** the code is built and tested against a fake service. The mic stays hidden until a provider is configured, so this needs a provider and a key.
