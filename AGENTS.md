# Working Guidelines

## Collaboration and planning

- Treat implementation requests as authorization to inspect the repository, implement the agreed change, and verify it. Do not stop at a proposal unless the user asks for planning only.
- Before significant changes to functionality, architecture, data models, or external behavior, clarify unresolved product decisions and present a concise plan for agreement. Handle routine implementation details autonomously.
- For layered systems, agree on user-visible behavior and acceptance criteria first, then settle data and interface contracts before building dependent components. Implement in dependency order where appropriate.
- Ask concise questions in the user's preferred language when requirements leave a meaningful decision unresolved. Do not ask about details that can be safely resolved by following established project conventions.
- Give brief progress updates at meaningful phase changes. In the final response, summarize the outcome, verification, commit, and remaining caveats.

## Documentation and contracts

- Keep this file in English. When starting work in a different project or adding project documentation whose language is unclear, ask the user which language to use. Preserve the language and style of existing documents unless asked to change them.
- Record agreed product behavior and operational instructions in the appropriate project documentation. Keep agent workflow guidance here rather than duplicating user-facing documentation.
- When changing an API, protocol, schema, or other contract between components, update its authoritative documentation and generated/client types as applicable. Keep producers and consumers consistent.
- Enforce authentication, authorization, validation, and other trust-boundary checks in the trusted service or layer; client-side checks are not a security boundary.

## Repository changes

- Inspect relevant source, tests, configuration, and documentation before editing. Search for existing helpers and conventions before adding new ones.
- Make focused, complete changes that follow the repository's patterns. Prefer correctness, clear errors, and type-safe code; avoid unrelated cleanup.
- Preserve unrelated user changes. Never overwrite or revert work outside the agreed scope.
- Do not add secrets to version control. Update example configuration and setup documentation when required settings change.
- Update directly related tests and documentation when behavior changes. Do not create planning or tracking files unless requested.
- Do not perform destructive actions on user data or environments without explicit authorization.

## Verification and completion

- Verify the actual acceptance criteria and affected user workflows, not only a proxy such as compilation. Run the smallest relevant existing tests and checks, expanding coverage when the change or results warrant it.
- For user-facing behavior, test the affected flow end to end when feasible. For runtime or deployment changes, build and run the affected services and check their health and relevant routes when feasible.
- Report checks that were not run and meaningful failures. Do not claim runtime behavior was verified based on static checks alone.
- Automatically commit completed implementation changes unless the user asks not to. Before committing, inspect the diff, stage only task-related changes, and ensure the commit does not include unrelated user work. Follow the repository's commit-message and trailer conventions.
