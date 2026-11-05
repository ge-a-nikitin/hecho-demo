# Working Guidelines

## Collaboration and planning

- Treat implementation requests as authorization to inspect the repository, implement the agreed change, and verify it. Do not stop at a proposal unless the user asks for planning only.
- Use this workflow for substantial product or engineering work:
  1. Discover the problem and actively identify gaps in understanding. Ask focused, preferably grouped questions to clarify user needs, constraints, scope, edge cases, and acceptance criteria before treating requirements as settled.
  2. Record agreed requirements in the appropriate project documentation.
  3. Explore relevant existing systems and identify architectural choices, dependencies, risks, and unresolved assumptions. Ask about consequential gaps, then agree on an architecture that satisfies the requirements, including data models, component boundaries, and contracts.
  4. Present an implementation plan ordered by dependencies. Clarify any meaningful scope, sequencing, or acceptance gaps before agreement; build from foundational layers upward (for example, data and persistence, domain/API, then user interfaces), adapting the sequence to the project.
  5. Implement, verify against the agreed criteria and affected workflows, and update relevant documentation. If verification exposes a mismatch or an unmade product decision, report it and clarify the expected behavior rather than silently guessing.
- At each stage, ask enough to establish a shared understanding and expose important edge cases; batch related questions when practical. Do not treat silence or an unverified assumption as user agreement.
- Do not skip agreement on significant product or architecture decisions. Once the relevant scope and approach are agreed, handle routine implementation details autonomously.
- For small, low-risk changes, use this workflow proportionally rather than adding unnecessary planning overhead.
- Ask concise questions in the user's preferred language. Avoid unnecessary questions about details that are low-risk, evident from context, or safely resolved by established project conventions; state consequential assumptions and remaining uncertainties explicitly.
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
