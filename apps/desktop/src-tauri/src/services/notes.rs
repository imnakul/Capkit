//! The Notes library: a small SQLite database of saved capture notes.
//!
//! Nothing is opened until the first call, so with Developer tools off no file
//! is created and no connection exists. Each note is one row of Markdown plus,
//! when it exists, the path of its screenshot under `images/`.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::SnaphubError;

const SCHEMA_VERSION: i64 = 1;
const MAX_MARKDOWN_BYTES: usize = 1024 * 1024;
const MAX_URL_CHARS: usize = 4096;
const MAX_QUERY_CHARS: usize = 200;
const MAX_PAGE_SIZE: u32 = 200;

fn notes_error(error: impl std::fmt::Display) -> SnaphubError {
    SnaphubError::Notes(error.to_string())
}

/// What the capture surface hands over to be stored.
#[derive(Debug, Clone)]
pub struct NewNote {
    pub id: String,
    pub page_url: Option<String>,
    pub page_title: Option<String>,
    pub markdown: String,
    pub pin_count: u32,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummaryDto {
    pub id: String,
    pub created_at: String,
    pub page_url: Option<String>,
    pub page_title: Option<String>,
    pub image_path: Option<String>,
    pub pin_count: u32,
    pub detail: String,
    /// The first comment line, so a card says something without opening the note.
    pub first_comment: Option<String>,
}

pub struct NotesStore {
    root: PathBuf,
    connection: Mutex<Option<Connection>>,
}

impl NotesStore {
    /// Does no I/O: the database opens on first use.
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            connection: Mutex::new(None),
        }
    }

    pub fn images_directory(&self) -> PathBuf {
        self.root.join("images")
    }

    pub fn image_path(&self, id: &str) -> PathBuf {
        self.images_directory().join(format!("{id}.png"))
    }

    fn with_connection<T>(
        &self,
        run: impl FnOnce(&Connection) -> Result<T, SnaphubError>,
    ) -> Result<T, SnaphubError> {
        let mut guard = self
            .connection
            .lock()
            .map_err(|_| SnaphubError::Notes("The notes database is unavailable".into()))?;
        if guard.is_none() {
            *guard = Some(self.open()?);
        }
        match guard.as_ref() {
            Some(connection) => run(connection),
            None => Err(SnaphubError::Notes(
                "The notes database is unavailable".into(),
            )),
        }
    }

    fn open(&self) -> Result<Connection, SnaphubError> {
        fs::create_dir_all(self.images_directory()).map_err(notes_error)?;
        let connection = Connection::open(self.root.join("notes.sqlite")).map_err(notes_error)?;
        // `journal_mode` returns a row, so it is read rather than executed.
        connection
            .query_row("PRAGMA journal_mode = WAL", [], |row| {
                row.get::<_, String>(0)
            })
            .map_err(notes_error)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(notes_error)?;
        if version > SCHEMA_VERSION {
            return Err(SnaphubError::Notes(
                "These notes were saved by a newer CapKit".into(),
            ));
        }
        if version < 1 {
            connection
                .execute_batch(
                    "BEGIN;
                     CREATE TABLE IF NOT EXISTS notes (
                       id TEXT PRIMARY KEY,
                       created_at TEXT NOT NULL,
                       page_url TEXT,
                       page_title TEXT,
                       markdown TEXT NOT NULL,
                       image_path TEXT,
                       pin_count INTEGER NOT NULL,
                       detail TEXT NOT NULL CHECK (detail IN ('extension','accessibility','none'))
                     );
                     CREATE INDEX IF NOT EXISTS notes_created_at ON notes(created_at DESC);
                     PRAGMA user_version = 1;
                     COMMIT;",
                )
                .map_err(notes_error)?;
        }
        Ok(connection)
    }

    /// Inserts or replaces by id, so retrying a save never makes a second row.
    pub fn insert(&self, note: &NewNote) -> Result<NoteSummaryDto, SnaphubError> {
        validate_note(note)?;
        let image = self.image_path(&note.id);
        let image_path = image
            .is_file()
            .then(|| image.to_string_lossy().into_owned());
        let created_at = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        self.with_connection(|connection| {
            connection
                .execute(
                    "INSERT OR REPLACE INTO notes
                       (id, created_at, page_url, page_title, markdown, image_path, pin_count, detail)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        note.id,
                        created_at,
                        note.page_url,
                        note.page_title,
                        note.markdown,
                        image_path,
                        note.pin_count,
                        note.detail
                    ],
                )
                .map_err(notes_error)?;
            Ok(())
        })?;
        Ok(NoteSummaryDto {
            id: note.id.clone(),
            created_at,
            page_url: note.page_url.clone(),
            page_title: note.page_title.clone(),
            image_path,
            pin_count: note.pin_count,
            detail: note.detail.clone(),
            first_comment: first_comment(&note.markdown),
        })
    }

    pub fn list(
        &self,
        query: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<NoteSummaryDto>, SnaphubError> {
        let pattern = query
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| {
                let clipped: String = text.chars().take(MAX_QUERY_CHARS).collect();
                format!("%{}%", escape_like(&clipped))
            });
        let limit = limit.clamp(1, MAX_PAGE_SIZE);
        self.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT id, created_at, page_url, page_title, markdown, image_path, pin_count, detail
                     FROM notes
                     WHERE ?1 IS NULL
                        OR page_title LIKE ?1 ESCAPE '\\'
                        OR page_url LIKE ?1 ESCAPE '\\'
                        OR markdown LIKE ?1 ESCAPE '\\'
                     ORDER BY created_at DESC, rowid DESC
                     LIMIT ?2 OFFSET ?3",
                )
                .map_err(notes_error)?;
            let rows = statement
                .query_map(params![pattern, limit, offset], |row| {
                    let markdown: String = row.get(4)?;
                    Ok(NoteSummaryDto {
                        id: row.get(0)?,
                        created_at: row.get(1)?,
                        page_url: row.get(2)?,
                        page_title: row.get(3)?,
                        image_path: row.get(5)?,
                        pin_count: row.get(6)?,
                        detail: row.get(7)?,
                        first_comment: first_comment(&markdown),
                    })
                })
                .map_err(notes_error)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(notes_error)
        })
    }

    pub fn markdown(&self, id: &str) -> Result<String, SnaphubError> {
        validate_id(id)?;
        self.with_connection(|connection| {
            connection
                .query_row("SELECT markdown FROM notes WHERE id = ?1", [id], |row| {
                    row.get::<_, String>(0)
                })
                .optional()
                .map_err(notes_error)?
                .ok_or_else(|| SnaphubError::Notes("That note no longer exists".into()))
        })
    }

    pub fn page_url(&self, id: &str) -> Result<Option<String>, SnaphubError> {
        validate_id(id)?;
        self.with_connection(|connection| {
            connection
                .query_row("SELECT page_url FROM notes WHERE id = ?1", [id], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .optional()
                .map_err(notes_error)?
                .ok_or_else(|| SnaphubError::Notes("That note no longer exists".into()))
        })
    }

    /// Removes the row and its screenshot.
    pub fn delete(&self, id: &str) -> Result<(), SnaphubError> {
        validate_id(id)?;
        self.with_connection(|connection| {
            connection
                .execute("DELETE FROM notes WHERE id = ?1", [id])
                .map_err(notes_error)?;
            Ok(())
        })?;
        match fs::remove_file(self.image_path(id)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(notes_error(error)),
        }
    }

    /// Writes the note's Markdown to a file a drag can carry, overwriting any
    /// earlier export of the same note.
    pub fn export_for_drag(&self, id: &str) -> Result<PathBuf, SnaphubError> {
        validate_id(id)?;
        let (created_at, page_url, markdown) = self.with_connection(|connection| {
            connection
                .query_row(
                    "SELECT created_at, page_url, markdown FROM notes WHERE id = ?1",
                    [id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(notes_error)?
                .ok_or_else(|| SnaphubError::Notes("That note no longer exists".into()))
        })?;
        let directory = self.root.join("export");
        fs::create_dir_all(&directory).map_err(notes_error)?;
        let stamp = DateTime::parse_from_rfc3339(&created_at)
            .map(|time| {
                time.with_timezone(&chrono::Local)
                    .format("%Y-%m-%d-%H%M")
                    .to_string()
            })
            .unwrap_or_else(|_| "note".into());
        let host = page_url
            .as_deref()
            .and_then(host_of)
            .map(|host| slug(&host))
            .filter(|host| !host.is_empty())
            .unwrap_or_else(|| "capture".into());
        let path = directory.join(format!("{stamp}-{host}.md"));
        fs::write(&path, markdown).map_err(notes_error)?;
        Ok(path)
    }

    /// Removes screenshots older than `older_than` that no note references.
    pub fn cleanup_unsaved_images(&self, older_than: Duration) -> Result<u32, SnaphubError> {
        let directory = self.images_directory();
        let Ok(entries) = fs::read_dir(&directory) else {
            return Ok(0);
        };
        let now = SystemTime::now();
        let mut removed = 0;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("png") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            if validate_id(id).is_err() {
                continue;
            }
            let old_enough = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| now.duration_since(modified).ok())
                .is_some_and(|age| age >= older_than);
            if !old_enough {
                continue;
            }
            let referenced = self.with_connection(|connection| {
                connection
                    .query_row("SELECT 1 FROM notes WHERE id = ?1", [id], |_| Ok(()))
                    .optional()
                    .map(|row| row.is_some())
                    .map_err(notes_error)
            })?;
            if !referenced && fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
        Ok(removed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DeliveryMode {
    Copy,
    Save,
    CopyAndSave,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliverNoteRequest {
    pub note_id: String,
    pub markdown: String,
    pub page_url: Option<String>,
    pub page_title: Option<String>,
    pub pin_count: u32,
    pub detail: String,
    pub mode: DeliveryMode,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryDto {
    pub copied: bool,
    pub saved: Option<NoteSummaryDto>,
    pub diagnostic: Option<String>,
}

/// Copies first, then saves, so a failed copy never leaves a saved note the
/// user believes is on their clipboard. A failure is reported in the result,
/// not as an error, because the caller needs to know how far it got.
/// Notes belong to Developer tools: every notes command checks this before touching the store.
pub fn require_developer_tools(enabled: bool) -> Result<(), SnaphubError> {
    if enabled {
        Ok(())
    } else {
        Err(SnaphubError::Notes("Developer tools is off".into()))
    }
}

pub fn deliver(
    store: &NotesStore,
    copy_text: impl FnOnce(&str) -> Result<(), SnaphubError>,
    request: &DeliverNoteRequest,
) -> DeliveryDto {
    let mut copied = false;
    if matches!(request.mode, DeliveryMode::Copy | DeliveryMode::CopyAndSave) {
        if let Err(error) = copy_text(&request.markdown) {
            return DeliveryDto {
                copied: false,
                saved: None,
                diagnostic: Some(error.to_string()),
            };
        }
        copied = true;
    }
    if matches!(request.mode, DeliveryMode::Save | DeliveryMode::CopyAndSave) {
        let note = NewNote {
            id: request.note_id.clone(),
            page_url: request.page_url.clone(),
            page_title: request.page_title.clone(),
            markdown: request.markdown.clone(),
            pin_count: request.pin_count,
            detail: request.detail.clone(),
        };
        return match store.insert(&note) {
            Ok(saved) => DeliveryDto {
                copied,
                saved: Some(saved),
                diagnostic: None,
            },
            Err(error) => DeliveryDto {
                copied,
                saved: None,
                diagnostic: Some(error.to_string()),
            },
        };
    }
    DeliveryDto {
        copied,
        saved: None,
        diagnostic: None,
    }
}

fn validate_id(id: &str) -> Result<(), SnaphubError> {
    match Uuid::parse_str(id) {
        Ok(parsed) if parsed.hyphenated().to_string() == id => Ok(()),
        _ => Err(SnaphubError::Notes("That note id is not valid".into())),
    }
}

fn validate_note(note: &NewNote) -> Result<(), SnaphubError> {
    validate_id(&note.id)?;
    if note.markdown.len() > MAX_MARKDOWN_BYTES {
        return Err(SnaphubError::Notes("The note is too large to save".into()));
    }
    if let Some(url) = &note.page_url
        && (url.chars().count() > MAX_URL_CHARS
            || !(url.starts_with("http://") || url.starts_with("https://")))
    {
        return Err(SnaphubError::Notes(
            "The page address must be an http or https link".into(),
        ));
    }
    if !(1..=99).contains(&note.pin_count) {
        return Err(SnaphubError::Notes(
            "A note holds between 1 and 99 pins".into(),
        ));
    }
    if !matches!(note.detail.as_str(), "extension" | "accessibility" | "none") {
        return Err(SnaphubError::Notes("Unknown note detail level".into()));
    }
    Ok(())
}

/// `%`, `_` and the escape character itself match literally.
fn escape_like(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        if matches!(character, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let authority = rest.split(['/', '?', '#']).next()?;
    let host = authority.rsplit('@').next()?.split(':').next()?;
    (!host.is_empty()).then(|| host.to_owned())
}

fn slug(text: &str) -> String {
    let mapped: String = text
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_lowercase() || character.is_ascii_digit() {
                character
            } else {
                '-'
            }
        })
        .collect();
    mapped
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// The first line of the first section's comment, skipping the placeholder.
fn first_comment(markdown: &str) -> Option<String> {
    let mut lines = markdown.lines();
    lines.find(|line| line.starts_with("## 1."))?;
    lines
        .map(str::trim)
        .find(|line| !line.is_empty())
        .filter(|line| *line != "_No comment_" && !line.starts_with('-') && !line.starts_with('#'))
        .map(|line| line.chars().take(160).collect())
}

#[cfg(test)]
mod tests {
    #[test]
    fn notes_commands_need_developer_tools() {
        let error = super::require_developer_tools(false).unwrap_err();
        assert!(error.to_string().contains("Developer tools is off"));
        assert!(super::require_developer_tools(true).is_ok());
    }

    use super::*;

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("capkit-notes-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create root");
            Self(path)
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn note(markdown: &str) -> NewNote {
        NewNote {
            id: Uuid::new_v4().to_string(),
            page_url: Some("https://example.com/pricing?plan=pro".into()),
            page_title: Some("Pricing".into()),
            markdown: markdown.into(),
            pin_count: 2,
            detail: "extension".into(),
        }
    }

    #[test]
    fn nothing_is_created_until_first_use() {
        let root = TestRoot::new();
        let path = root.0.join("notes");
        let _store = NotesStore::new(path.clone());
        assert!(!path.exists());
    }

    #[test]
    fn migrates_a_new_database_to_version_one() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        store.list(None, 10, 0).expect("list");
        let version: i64 = Connection::open(root.0.join("notes").join("notes.sqlite"))
            .expect("open")
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("version");
        assert_eq!(version, 1);
    }

    #[test]
    fn inserts_and_lists_newest_first() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let first = store
            .insert(&note("# One\n\n## 1. Button\n\nMake it bigger\n"))
            .expect("first");
        let second = store
            .insert(&note("# Two\n\n## 1. Card\n\n_No comment_\n"))
            .expect("second");
        let listed = store.list(None, 10, 0).expect("list");
        assert_eq!(
            listed
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec![second.id.as_str(), first.id.as_str()]
        );
        assert_eq!(listed[1].first_comment.as_deref(), Some("Make it bigger"));
        assert_eq!(listed[0].first_comment, None);
        assert_eq!(store.list(None, 1, 1).expect("page").len(), 1);
    }

    #[test]
    fn inserting_the_same_id_twice_keeps_one_row() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let item = note("# Same\n");
        store.insert(&item).expect("first");
        store.insert(&item).expect("retry");
        assert_eq!(store.list(None, 10, 0).expect("list").len(), 1);
    }

    #[test]
    fn search_treats_percent_and_underscore_literally() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        store.insert(&note("# 100% sure\n")).expect("percent");
        store.insert(&note("# snake_case\n")).expect("underscore");
        store.insert(&note("# plain text\n")).expect("plain");
        assert_eq!(store.list(Some("100%"), 10, 0).expect("percent").len(), 1);
        assert_eq!(
            store
                .list(Some("snake_case"), 10, 0)
                .expect("underscore")
                .len(),
            1
        );
        assert_eq!(store.list(Some("%"), 10, 0).expect("only percent").len(), 1);
        assert_eq!(
            store.list(Some("_"), 10, 0).expect("only underscore").len(),
            1
        );
        assert_eq!(
            store.list(Some("example.com"), 10, 0).expect("host").len(),
            3
        );
    }

    #[test]
    fn search_is_not_injectable() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        store.insert(&note("# plain\n")).expect("insert");
        assert!(
            store
                .list(Some("%' OR 1=1 --"), 10, 0)
                .expect("search")
                .is_empty()
        );
        assert_eq!(store.list(Some("   "), 10, 0).expect("blank").len(), 1);
    }

    #[test]
    fn rejects_invalid_notes() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let mut bad_id = note("x");
        bad_id.id = "../escape".into();
        assert!(store.insert(&bad_id).is_err());
        let mut upper = note("x");
        upper.id = upper.id.to_uppercase();
        assert!(store.insert(&upper).is_err());
        assert!(
            store
                .insert(&note(&"a".repeat(MAX_MARKDOWN_BYTES + 1)))
                .is_err()
        );
        let mut scheme = note("x");
        scheme.page_url = Some("javascript:alert(1)".into());
        assert!(store.insert(&scheme).is_err());
        let mut pins = note("x");
        pins.pin_count = 0;
        assert!(store.insert(&pins).is_err());
        pins.pin_count = 100;
        assert!(store.insert(&pins).is_err());
        let mut detail = note("x");
        detail.detail = "other".into();
        assert!(store.insert(&detail).is_err());
        let mut no_url = note("x");
        no_url.page_url = None;
        assert!(store.insert(&no_url).is_ok());
    }

    #[test]
    fn delete_removes_the_row_and_its_image() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let item = note("# Gone\n");
        fs::create_dir_all(store.images_directory()).expect("images");
        fs::write(store.image_path(&item.id), b"png").expect("image");
        let saved = store.insert(&item).expect("insert");
        assert!(saved.image_path.is_some());
        store.delete(&item.id).expect("delete");
        assert!(!store.image_path(&item.id).exists());
        assert!(store.markdown(&item.id).is_err());
        store.delete(&item.id).expect("deleting twice is harmless");
    }

    #[test]
    fn cleanup_keeps_referenced_and_recent_images() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let kept = note("# Kept\n");
        let orphan = Uuid::new_v4().to_string();
        fs::create_dir_all(store.images_directory()).expect("images");
        fs::write(store.image_path(&kept.id), b"png").expect("kept image");
        fs::write(store.image_path(&orphan), b"png").expect("orphan image");
        fs::write(store.images_directory().join("not-a-note.png"), b"png").expect("stray");
        store.insert(&kept).expect("insert");

        assert_eq!(
            store
                .cleanup_unsaved_images(Duration::from_secs(3600))
                .expect("recent"),
            0
        );
        assert_eq!(
            store.cleanup_unsaved_images(Duration::ZERO).expect("all"),
            1
        );
        assert!(store.image_path(&kept.id).exists());
        assert!(!store.image_path(&orphan).exists());
        assert!(store.images_directory().join("not-a-note.png").exists());
    }

    #[test]
    fn export_for_drag_writes_a_sanitised_markdown_file() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let item = note("# Export me\n");
        store.insert(&item).expect("insert");
        let path = store.export_for_drag(&item.id).expect("export");
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .expect("name");
        assert!(name.ends_with("-example-com.md"), "{name}");
        assert_eq!(fs::read_to_string(&path).expect("read"), "# Export me\n");
        assert_eq!(store.export_for_drag(&item.id).expect("again"), path);
    }

    #[test]
    fn an_unusable_root_fails_the_save_without_panicking() {
        let root = TestRoot::new();
        let blocker = root.0.join("blocker");
        fs::write(&blocker, b"file").expect("file");
        let store = NotesStore::new(blocker);
        assert!(store.insert(&note("# x\n")).is_err());
    }

    fn delivery(mode: DeliveryMode) -> DeliverNoteRequest {
        DeliverNoteRequest {
            note_id: Uuid::new_v4().to_string(),
            markdown: "# Note\n".into(),
            page_url: None,
            page_title: None,
            pin_count: 1,
            detail: "none".into(),
            mode,
        }
    }

    #[test]
    fn a_failed_copy_saves_nothing() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let result = deliver(
            &store,
            |_| Err(SnaphubError::Clipboard("busy".into())),
            &delivery(DeliveryMode::CopyAndSave),
        );
        assert!(!result.copied);
        assert!(result.saved.is_none());
        assert!(result.diagnostic.expect("diagnostic").contains("busy"));
        assert!(store.list(None, 10, 0).expect("list").is_empty());
    }

    #[test]
    fn copy_succeeds_even_when_the_save_fails() {
        let root = TestRoot::new();
        let blocker = root.0.join("blocker");
        fs::write(&blocker, b"file").expect("file");
        let store = NotesStore::new(blocker);
        let result = deliver(&store, |_| Ok(()), &delivery(DeliveryMode::CopyAndSave));
        assert!(result.copied);
        assert!(result.saved.is_none());
        assert!(result.diagnostic.is_some());
    }

    #[test]
    fn modes_copy_and_save_only_what_they_name() {
        let root = TestRoot::new();
        let store = NotesStore::new(root.0.join("notes"));
        let copy_only = deliver(&store, |_| Ok(()), &delivery(DeliveryMode::Copy));
        assert!(copy_only.copied && copy_only.saved.is_none() && copy_only.diagnostic.is_none());
        let save_only = deliver(
            &store,
            |_| panic!("save must not touch the clipboard"),
            &delivery(DeliveryMode::Save),
        );
        assert!(!save_only.copied && save_only.saved.is_some());
        let both = deliver(&store, |_| Ok(()), &delivery(DeliveryMode::CopyAndSave));
        assert!(both.copied && both.saved.is_some());
        assert_eq!(store.list(None, 10, 0).expect("list").len(), 2);
    }

    #[test]
    fn host_and_slug_helpers() {
        assert_eq!(
            host_of("https://user:pw@Example.com:8080/a?b#c").as_deref(),
            Some("Example.com")
        );
        assert_eq!(host_of("no-scheme"), None);
        assert_eq!(slug("My Site!.com"), "my-site-com");
    }
}
