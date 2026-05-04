# Antigravity Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your Antigravity equivalent:

| Skill references | Antigravity equivalent |
|-----------------|----------------------|
| `Read` (file reading) | `view_file` |
| `Write` (file creation) | `write_to_file` |
| `Edit` (file editing) | `replace_file_content` / `multi_replace_file_content` |
| `Bash` (run commands) | `run_command` |
| `Grep` (search file content) | `grep_search` |
| `Glob` (search files by name) | `run_command` (e.g., `dir /s /b *.ts`) |
| `Skill` tool (invoke a skill) | `view_file` (Read the SKILL.md file) |
| `WebSearch` | `search_web` |
| `WebFetch` | `read_url_content` / `read_browser_page` |
| `Task` tool (dispatch subagent) | `browser_subagent` |

## Subagent support

Antigravity supports subagents via the `browser_subagent` tool for browser tasks. For code tasks, use the skills directly in the current session or dispatch a plan.

## Additional Antigravity tools

| Tool | Purpose |
|------|---------|
| `list_dir` | List files and subdirectories |
| `generate_image` | Generate or edit images |
| `command_status` | Check status of background commands |
| `send_command_input` | Interact with running commands |
