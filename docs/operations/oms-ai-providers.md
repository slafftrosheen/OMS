# OMS AI providers

Deploy the application and apply `20261122000001_oms_ai_provider_settings.sql` through the existing Supabase migration process. Existing environment settings remain the defaults until R&D saves a choice.

Open **Settings → AI** as an R&D user. Choose OpenRouter or OpenAI API, enter the OpenAI text/tool and vision model IDs from your API project, and save. The OpenRouter key and model controls remain available in the same tab. The OpenAI key is optional if the server already has `OPENAI_API_KEY` configured. Saving a new key writes it to Supabase Vault. Only a masked suffix appears in settings. The stored key takes precedence over the server environment key. Removing the stored key restores the environment key if one exists.

The company sharing switch governs both providers. Use the Settings connection test for a short request to the active provider. The test can consume API quota. Verify that the chosen OpenAI models support text tools and image inputs for the workflows you use.

The OMS assistant and canvas use the same provider routing. Canvas scene context, explicitly selected image/file analysis, and validated action proposals use the selected provider. Review proposed changes before applying them in the canvas. OpenRouter paid OCR and OpenRouter web search are available when OpenRouter is active and the corresponding deployment flags are enabled. Local text extraction, visual PDF analysis and SearXNG remain available with direct OpenAI.

## ChatGPT plan usage

The shared OMS server uses API credentials for OpenAI inference. OpenAI requires approval for hosted applications to use a person's ChatGPT plan. See the [OpenAI partner access form](https://openai.com/form/sign-in-with-chatgpt-interest/) and [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart). A hosted plan integration needs the approved OAuth client and inference scopes, per-person consent and session handling. R&D settings display the status and link.
