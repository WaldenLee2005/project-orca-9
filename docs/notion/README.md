# Notion setup for Orca

The private [Orca Project Hub](https://app.notion.com/p/3f0b1348a34d812c832ace7baa9d4b75) and [Orca Roadmap](https://app.notion.com/p/c8cffe9817e34c3fb723ec417fc126ab) are created in Notion. The roadmap has 23 dated release tasks and four later backlog items, targeting a January 4, 2027 first release with a December 6 feature freeze.

## Use the live project space

Open the roadmap and select **Release timeline**, **By status**, **All work** or **Later**. The hub also contains an inline timeline. Open a task to review its completion criteria, linked prerequisites and project reference, then update Status and dates as work progresses. Owner is available for assignment.

Prerequisites are completion/release gates; preparation can overlap and dates do not shift automatically. The live database uses **Task ID** for the IDs labeled **ID** in the CSV backup. Status is a Select property with Backlog, Planned, In progress, Blocked and Done.

These files preserve the October 4, 2026 planning snapshot. Use the import steps below only to recreate the space if needed; reimporting into the existing database can duplicate tasks. Notion and GitHub updates are maintained manually, with no automatic sync.

## Import the project hub

1. On Notion desktop/web, open **Settings → Import → Text & Markdown**.
2. Choose **Orca Project Hub.md** in this folder.
3. Open the imported page and name it **Orca Project Hub**. Keep it private unless you choose to share it.

Use Import rather than opening the file as an attachment, which produces a read-only preview. Check headings, tables, links and checkboxes after import. [Official import instructions](https://www.notion.com/help/import-data-into-notion)

## Import the roadmap database

1. Open **Settings → Import → CSV**, choose **Orca Roadmap.csv**, and create a new database inside the project hub if the importer offers that destination. Otherwise, move the imported database into the hub afterward.
2. Name the database **Orca Roadmap**. Map **Name** to its title property.
3. Verify the property types below. Dates use the documented **MM/DD/YYYY** import format. Later work intentionally has no dates.

| Column | Recommended type |
| --- | --- |
| Name | Title |
| ID | Text |
| Workstream, Phase, Priority | Select |
| Status | Select initially |
| Start, End | Date |
| Depends on, Completion criteria | Text |
| Source | URL |

If a column imports as Text, open its property menu, choose **Edit property → Change type**, and verify the values. You can convert Status to Notion's native Status property afterward, keeping Planned/Backlog in To-do and adding In progress, Blocked and Done as needed. Blocked tasks remain incomplete. CSV import does not guarantee native Status recognition. [Database properties](https://www.notion.com/help/database-properties), [changing property types](https://www.notion.com/help/create-a-database)

Import once. Reimporting or merging CSV appends rows and can create duplicates. CSV cannot create relations, formulas or rollups. The ID and Depends on fields remain text references until you configure real dependency relations. [CSV import limits](https://www.notion.com/help/import-data-into-notion)

## Create the timeline and working views

1. Click **+** beside the database view name, choose **Timeline**, and name it **Release timeline**.
2. Open database settings → **Layout → Show timeline by**. Enable separate start/end properties and select **Start** and **End**.
3. Set the scale to weeks or months. Filter to **Start is not empty** and show Name, Status and Workstream on cards. This displays the 23 dated release tasks.
4. Add a **Board** view named **By status**, grouped by Status, and a **Table** view named **All work**, sorted by Start. Add a **Later** view filtered to Phase = Later for the four undated backlog items.

Timeline configuration is separate from CSV import. Check that the feature freeze ends December 6, 2026 and the launch target is January 4, 2027. [Timelines](https://www.notion.com/help/timelines), [views, filters and sorting](https://www.notion.com/help/views-filters-and-sorts)

## Use dependencies and acceptance checks

“Depends on” identifies completion or release gates. Preparation can overlap prerequisite work, so the dates are not a strict finish-to-start schedule. For example, beta fixes begin while testers continue to report findings.

For visual connections, optionally open database settings → **More settings → Dependencies** and choose **Do not automatically shift**. Wire the relationships manually from the text IDs, using timeline arrows. Automatic date shifting can change the proposed schedule. [Dependency settings](https://www.notion.com/help/tasks-and-dependencies), [connecting tasks](https://www.notion.com/en-gb/help/guides/tasks-manageable-steps-sub-tasks-dependencies)

Open a task to read its completion criteria and source. Assign yourself through a Person property if useful, then update status and dates weekly. Record unresolved build/device access, coaching review and store approval as blockers. Keep the repository's ROADMAP.md aligned when scope changes.

## Verify the imported result

- 27 task pages: R01–R23 for release work and L01–L04 for later work.
- Name is the title; Start and End are dates.
- Later tasks have blank dates and appear in the Later view.
- The timeline spans October 5, 2026 through January 4, 2027.
- Source links, completion criteria and dependency text are retained.
- Existing code is described as implemented; future work remains Planned or Backlog.
