# Accepted agents

One manifest per agent, named `<name>.json`. These are created for you from
the onboarding form; you should not need to write one by hand.

Every file here is validated on each pull request against
`../schema/agent-manifest.schema.json`.

Manifests declare the *shape* of any credential an agent needs, never a value.
The validator rejects anything that looks like a real key.
