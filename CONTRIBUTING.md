# Contributing to DB Studio

Thank you for your interest in contributing to DB Studio! This guide will help you understand our workflow and contribution process.

## Table of Contents

- [Development Setup](#development-setup)
- [Issues](#issues)
- [Branches](#branches)
- [Commits](#commits)
- [Pull Requests](#pull-requests)
- [Code Review](#code-review)
- [Testing](#testing)
- [Merging](#merging)
- [Quick Reference](#quick-reference)

## Development Setup

Before contributing to DB Studio, make sure you have the following installed:

- [Bun](https://bun.sh/) - We use Bun instead of Node.js/npm/pnpm
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/husamql3/db-studio.git
   cd db-studio
   ```

3. Install dependencies:

   ```bash
   bun install
   ```

4. Build the project:

   ```bash
   bun run build
   ```

5. Test your changes:
   ```bash
   bun test
   ```

## Issues

The GitHub workflow typically begins by creating an issue to assign tasks. There's no single right way to divide tasks into issues; it usually starts with team agreement.

### Issue Naming Convention

```text
[<type>]: <short-description>
```

### Examples

```text
[FIX]: Fix auth flow
[STYLE]: Improve login page styling
[FEATURE]: Implement admin dashboard
```

### Subtasks

You can also break down issues into subtasks:

```text
[FEATURE]: Implement admin dashboard

[SUB-FEAT]: Implement dashboard UI
[SUB-FEAT]: Implement dashboard APIs
```

## Branches

After creating an issue, the next step is to start coding by creating a branch separate from the main branch. This separation ensures that any errors during development won't affect the production environment.

### Branch Naming Convention

```text
<type>/<issue-number>/<short-description>
```

### Examples

- For `[FIX]: Fix auth flow`, the branch name could be `fix/<issue-number>/fix_auth_flow`
- For `[STYLE]: Improve login page styling`, it might be `style/<issue-number>/improve_login_page_styling`
- For `[FEATURE]: Implement admin dashboard`, use `feature/<issue-number>/implement_dashboard`

### Creating a Branch

GitHub offers a feature that allows you to link an issue to a branch. Navigate to the issue page, find the "Development" section on the right, and click "Create a branch." This means that when the branch work is completed and the pull request is merged, the issue is automatically closed.

## Commits

### Commit Best Practices

- Commit frequently rather than waiting until all work is done
- Write clear, descriptive commit messages that explain what you did
- Use the present tense, such as "add," "fix," or "update"
- Use the imperative mood, like "add" instead of "added"
- Keep the message under 50 characters if possible

### Commit Message Format

```text
<type>: <short-description>
```

For mono repos (where frontend and backend code are in the same repository):

```text
<type>(<scope>): <short-description>
```

### Examples

```text
feat: implement dashboard header
feat: implement dashboard main content
style: add dashboard styling
fix: fix dashboard data fetching
enhance: add dashboard animations
refactor: improve dashboard API implementation
docs: add API documentation for dashboard
```

With scopes (for mono repos):

```text
feat(front): implement dashboard header
feat(back): implement dashboard APIs
style(front): add dashboard styling
fix(back): fix dashboard data fetching
enhance(front): add dashboard animations
refactor(back): improve dashboard API readability
docs(front): add API documentation for dashboard
```

## Pull Requests

After committing your changes, push them to the remote branch and create a Pull Request (PR) to merge your changes with the main branch.

### Creating a Pull Request

1. Navigate to the branch page and click "Create a Pull Request"
2. Provide a title and description for the PR
3. Link it to an issue or assign it to a reviewer
4. Add labels, such as `bug`, `feature`, or `enhancement`

### PR Naming Convention

```text
<type>/<short-description>
```

Or with scope:

```text
<type>/<scope>/<short-description>
```

Use kebab-case for the short description.

### Examples

- For `style/<issue-number>/improve_login_page_styling`, the PR might be `style/improve-login-page-styling`
- For `feature/<issue-number>/implement_dashboard`, it might be `feature/implement-dashboard`

> **Note:** It's perfectly fine to use the branch name as the PR title.

## Code Review

Code review is a critical step before merging your code into the main branch. It ensures that the code is clean, follows best practices, and doesn't introduce bugs or performance issues.

### Best Practices

- Assign the PR to someone experienced in the codebase, ideally a senior developer
- Having two reviewers for each PR is recommended
- Code review helps catch more issues and promotes knowledge sharing among team members

## Testing

Before submitting a PR, ensure all tests pass:

```bash
# Run all tests
bun test

# Run tests for specific package
cd packages/core
bun test

# Run tests in watch mode
bun test --watch
```

Make sure to add tests for any new features or bug fixes.

## Merging

The final step in the GitHub workflow is merging the PR into the main branch.

### Steps

1. Ensure the PR is approved by reviewers
2. Merge the PR into the main branch
3. The associated issue will be automatically closed (if linked)
4. Delete the branch after merging to keep the repository clean

Once the code is in the main branch, it's ready for production!

## Quick Reference

### Workflow Summary

1. **Create an Issue**: `[<type>]: <short-description>` (e.g., `[FIX]: Fix auth flow`)
2. **Create a Branch**: `<type>/<issue-number>/<short-description>` (e.g., `fix/92/fix_auth_flow`)
3. **Commit Your Changes**: Use concise, descriptive messages (e.g., `feat: implement dashboard header`)
4. **Create a Pull Request**: Use a clear title that reflects the branch name (e.g., `feature/implement-dashboard`)
5. **Code Review**: Assign one or two reviewers to check the code before merging
6. **Merge and Clean Up**: Merge the PR, close the issue, and delete the branch

### Types

Can include:

- `feat` - New feature
- `fix` - Bug fix
- `style` - Styling changes
- `enhance` - Enhancement to existing feature
- `refactor` - Code refactoring
- `docs` - Documentation changes

---

Thank you for contributing! If you have any questions, please feel free to open an issue or reach out to the maintainers.
