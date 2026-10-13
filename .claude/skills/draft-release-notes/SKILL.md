---
name: draft-release-notes
description: Draft or update the "## Release Notes" section of a pipecat-client-web PR description, in house style, for the release-notes curation pipeline. Use when asked to write release notes for a PR, before or after merge.
---

# Draft release notes for a PR

Draft the `## Release Notes` section of a PR's description. The
`curate-release-notes` job of the Release Please workflow copies this section
verbatim into the package CHANGELOG and the GitHub release, replacing the
auto-generated entries for that PR's commits — so it must cover **everything
user-facing** in the PR.

## Steps

1. Determine the PR number from the arguments or conversation; if ambiguous,
   ask. Read it: `gh pr view <n> --json title,body,files` and `gh pr diff <n>`.
   Read the relevant source files when the diff alone doesn't make API names,
   defaults, or version gates clear — accuracy over speed.
2. Write the section in this exact structure (the curation script parses it):

   ```markdown
   ## Release Notes

   ### client-js

   #### Features

   - ...

   #### Deprecations

   - ...

   ### client-react

   #### Bug Fixes

   - ...
   ```

   Include only the packages the PR touches, and only the headings with
   content. Available `####` headings (aliases like Added/Fixed/Deprecated/
   Perf/Misc also work): Features, Changed, Deprecations, Removed, Bug Fixes,
   Security, Performance Improvements, Reverts, Documentation, Other.
3. House style for bullets:
   - One bullet per user-facing change, written as full sentences aimed at SDK
     users: what was added or fixed, how to use it, and any version or
     compatibility caveats (e.g. required RTVI protocol or peer package
     versions). A change is not a commit: a single commit that adds a new
     interface and deprecates the old one gets a Features bullet and a
     Deprecations bullet, both citing the same commit; conversely one bullet
     may cite several commits.
   - Link to docs under https://docs.pipecat.ai/api-reference/client/ where
     pages exist, and end each bullet with a link to the main commit(s), e.g.
     `([079b558](https://github.com/pipecat-ai/pipecat-client-web/commit/<full sha>))`.
   - Name exact API surface and verify each name against the code — a getter
     is not a method. Bullets are markdown: wrap every code identifier in
     backticks — methods (`sendText()`), events and messages (`user-input`,
     `RTVIEvent.UserInput`), types (`TextType`), fields and options
     (`input_type`, `includeBackchannel`), literal values (`"backchannel"`,
     `sent`), and package names (`@pipecat-ai/client-js`).
   - Skip internal refactors, tests, and CI changes. If nothing is
     user-facing, say so and recommend deleting the section (the generated
     commit-message entries will be used instead).
4. Show the drafted section to the user for review. Only after they approve,
   apply it with `gh pr edit <n> --body-file <file>`: replace an existing
   `## Release Notes` section (through the next `## ` heading) or append the
   section, preserving the rest of the description exactly and dropping
   template placeholder bullets (`- ...`) and template HTML comments.
5. If the PR is already merged and part of a pending release, remind the user
   to re-run the "Release Please" workflow (workflow_dispatch) so the open
   release PR picks up the new notes.
