//! Path display helpers.

use std::path::{Path, PathBuf};

/// Strips the Windows verbatim prefix (`\\?\C:\…`, `\\?\UNC\…`) that
/// `std::fs::canonicalize` adds, so stored and displayed folders read
/// normally. Paths that cannot be represented without the prefix (reserved
/// names, very long paths) are returned unchanged.
pub fn display_path(path: &Path) -> PathBuf {
    // dunce leaves `\\?\UNC\server\share` alone; the `\\server\share` form is
    // equivalent for any path that was canonicalized.
    if let Some(rest) = path
        .to_str()
        .and_then(|text| text.strip_prefix(r"\\?\UNC\"))
    {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    dunce::simplified(path).to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_paths_are_unchanged() {
        let path = Path::new("relative").join("shots");
        assert_eq!(display_path(&path), path);
    }

    #[cfg(windows)]
    #[test]
    fn strips_the_drive_prefix() {
        assert_eq!(display_path(Path::new(r"\\?\C:\a")), PathBuf::from(r"C:\a"));
    }

    #[cfg(windows)]
    #[test]
    fn strips_the_unc_prefix() {
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share\x")),
            PathBuf::from(r"\\server\share\x")
        );
    }

    #[cfg(windows)]
    #[test]
    fn keeps_the_prefix_when_the_path_cannot_be_simplified() {
        let reserved = Path::new(r"\\?\C:\a\CON");
        assert_eq!(display_path(reserved), reserved);
    }
}
