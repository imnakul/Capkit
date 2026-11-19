use std::{ffi::c_void, thread::sleep, time::Duration};

use windows::Win32::{
    Foundation::{HWND, RECT},
    System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    },
    UI::{
        Accessibility::{
            CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationCondition,
            IUIAutomationElement, TreeScope_Descendants, UIA_BoundingRectanglePropertyId,
            UIA_ControlTypePropertyId, UIA_CustomControlTypeId, UIA_DocumentControlTypeId,
            UIA_GroupControlTypeId, UIA_IsContentElementPropertyId, UIA_IsControlElementPropertyId,
            UIA_IsOffscreenPropertyId, UIA_NamePropertyId, UIA_PaneControlTypeId,
        },
        WindowsAndMessaging::{GetClassNameW, GetWindowRect},
    },
};

use crate::{
    domain::{DetectedTargetDto, Point, Rect},
    error::SnaphubError,
};

const MAX_CACHED_ELEMENTS: i32 = 4_000;
// Regions smaller than this (in physical pixels) are too small to aim at.
const MIN_REGION_SIZE: f64 = 6.0;
// Layout containers (Chromium maps a plain, role-less <div> to Group/Pane/Document/
// Custom) are only worth surfacing up to this fraction of the window; beyond that
// they're indistinguishable from "the whole page", which is already covered by the
// window-level target.
const MAX_LAYOUT_CONTAINER_RATIO: f64 = 0.9;
// Nested elements (a wrapper <div> around a single child) frequently share an
// identical bounding rect; keep only one of each near-duplicate.
const DEDUPE_TOLERANCE: f64 = 2.0;
// Chromium (Chrome, Edge, Electron, WebView2) leaves a web page out of its
// accessibility tree until an assistive tool asks for it (see `wake_web_content`).
// The tree then fills in asynchronously, so we retry briefly if too few candidates
// come back, and the caller rescans on later hovers while the result keeps growing
// (see `UiScan::provisional`).
const BROWSER_WINDOW_CLASSES: [&str; 2] = ["Chrome_WidgetWin_1", "MozillaWindowClass"];
// The child window that hosts a Chromium web page.
const WEB_CONTENT_CLASS: &str = "Chrome_RenderWidgetHostHWND";
const BROWSER_SCAN_MIN_REGIONS: usize = 6;
// Upper bound on browser UI elements visited while looking for the page's Document element.
const MAX_DOCUMENT_SEARCH_ELEMENTS: usize = 400;
// How long the page rectangles found by that search are reused while the window doesn't move.
const DOCUMENT_CACHE_TTL: Duration = Duration::from_secs(2);
const BROWSER_SCAN_RETRIES: u32 = 1;
const BROWSER_SCAN_RETRY_DELAY: Duration = Duration::from_millis(150);

/// The result of one scan. A scan of a window that shows web content is
/// provisional: the page may still be building its accessibility tree after we
/// asked for it, so the caller should scan again on a later hover.
pub struct UiScan {
    pub regions: Vec<DetectedTargetDto>,
    pub provisional: bool,
}

pub fn scan_window(window_id: u32) -> Result<UiScan, SnaphubError> {
    let pages = wake_web_content(window_id);
    let browser = pages > 0 || is_browser_window(window_id);
    let regions = regions_for_window(window_id, browser)?;
    let provisional = browser;
    Ok(UiScan {
        regions,
        provisional,
    })
}

fn regions_for_window(
    window_id: u32,
    browser: bool,
) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
    // UI Automation objects are apartment-bound. Each bounded scan initializes and releases COM
    // on the worker thread that performs it; callers cache the resulting plain rectangles.
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if initialized.is_err() {
        return Err(SnaphubError::Capture(format!(
            "UI Automation could not initialize: {initialized:?}"
        )));
    }

    let mut result = unsafe { collect_regions(window_id, browser) };
    if browser {
        for _ in 0..BROWSER_SCAN_RETRIES {
            let needs_retry = match &result {
                Ok(regions) => regions.len() < BROWSER_SCAN_MIN_REGIONS,
                Err(_) => true,
            };
            if !needs_retry {
                break;
            }
            sleep(BROWSER_SCAN_RETRY_DELAY);
            let retry = unsafe { collect_regions(window_id, browser) };
            let retry_is_better = match (&result, &retry) {
                (Ok(existing), Ok(candidate)) => candidate.len() > existing.len(),
                (Err(_), Ok(_)) => true,
                _ => false,
            };
            if retry_is_better {
                result = retry;
            }
        }
    }

    unsafe { CoUninitialize() };
    result
}

fn window_class_name(window_id: u32) -> String {
    let hwnd = HWND(window_id as usize as *mut c_void);
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if length <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..length as usize])
}

fn is_browser_window(window_id: u32) -> bool {
    let class_name = window_class_name(window_id);
    BROWSER_WINDOW_CLASSES
        .iter()
        .any(|candidate| class_name == *candidate)
}

unsafe fn collect_regions(
    window_id: u32,
    browser: bool,
) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
            .map_err(SnaphubError::capture)?
    };
    let window_handle = HWND(window_id as usize as *mut c_void);
    let root = unsafe {
        automation
            .ElementFromHandle(window_handle)
            .map_err(SnaphubError::capture)?
    };
    let condition = unsafe {
        automation
            .CreateTrueCondition()
            .map_err(SnaphubError::capture)?
    };
    let cache_request = unsafe {
        automation
            .CreateCacheRequest()
            .map_err(SnaphubError::capture)?
    };
    for property in [
        UIA_BoundingRectanglePropertyId,
        UIA_ControlTypePropertyId,
        UIA_IsContentElementPropertyId,
        UIA_IsControlElementPropertyId,
        UIA_IsOffscreenPropertyId,
        UIA_NamePropertyId,
    ] {
        unsafe {
            cache_request
                .AddProperty(property)
                .map_err(SnaphubError::capture)?;
        }
    }

    let mut window_rect = RECT::default();
    let window_area = if unsafe { GetWindowRect(window_handle, &mut window_rect) }.is_ok() {
        f64::from((window_rect.right - window_rect.left).max(0))
            * f64::from((window_rect.bottom - window_rect.top).max(0))
    } else {
        0.0
    };

    let mut regions = Vec::new();
    let window_scope = ScanScope {
        window_id,
        window_area,
        viewport: None,
        id_prefix: "ui",
    };
    let page = unsafe {
        scan_subtree(
            &root,
            &condition,
            &cache_request,
            &window_scope,
            &mut regions,
        )?
    };

    // A browser's own tabs, toolbar and side panels can use up the element cap
    // before the walk reaches the page. Scan the visible page on its own as well,
    // with its own cap, clipped to the page's viewport.
    if browser && let Some((document, viewport)) = page {
        let page_scope = ScanScope {
            window_id,
            window_area,
            viewport: Some(viewport),
            id_prefix: "web",
        };
        unsafe {
            scan_subtree(
                &document,
                &condition,
                &cache_request,
                &page_scope,
                &mut regions,
            )?;
        }
    }

    regions.sort_by(|left, right| {
        let left_area = left.bounds.width * left.bounds.height;
        let right_area = right.bounds.width * right.bounds.height;
        left_area.total_cmp(&right_area)
    });

    let mut deduped: Vec<DetectedTargetDto> = Vec::with_capacity(regions.len());
    for region in regions {
        let is_duplicate = deduped
            .iter()
            .any(|existing| rects_nearly_equal(&existing.bounds, &region.bounds));
        if !is_duplicate {
            deduped.push(region);
        }
    }
    Ok(deduped)
}

struct ScanScope {
    window_id: u32,
    window_area: f64,
    /// Inside a web page: the page's visible rectangle. Elements are clipped to
    /// it, and the browser's offscreen flag is not trusted on its own (a page
    /// behind the capture overlay can report its elements as offscreen).
    viewport: Option<Rect>,
    id_prefix: &'static str,
}

unsafe fn scan_subtree(
    root: &IUIAutomationElement,
    condition: &IUIAutomationCondition,
    cache_request: &IUIAutomationCacheRequest,
    scope: &ScanScope,
    regions: &mut Vec<DetectedTargetDto>,
) -> Result<Option<(IUIAutomationElement, Rect)>, SnaphubError> {
    let elements = unsafe {
        root.FindAllBuildCache(TreeScope_Descendants, condition, cache_request)
            .map_err(SnaphubError::capture)?
    };
    let count =
        unsafe { elements.Length().map_err(SnaphubError::capture)? }.clamp(0, MAX_CACHED_ELEMENTS);
    regions.reserve(count as usize);
    // The largest Document seen: in a browser, the active tab's web page.
    let mut largest_document: Option<(IUIAutomationElement, Rect)> = None;

    for index in 0..count {
        let Ok(element) = (unsafe { elements.GetElement(index) }) else {
            continue;
        };
        let is_control = unsafe { element.CachedIsControlElement() }
            .map(windows::core::BOOL::as_bool)
            .unwrap_or(false);
        let is_content = unsafe { element.CachedIsContentElement() }
            .map(windows::core::BOOL::as_bool)
            .unwrap_or(false);
        // Web pages made of role-less <div>s report neither flag: Chromium/Firefox
        // still expose them as Group/Pane/Document/Custom nodes, so accept those as
        // a lower-confidence "layout container" match rather than dropping them.
        let control_type = unsafe { element.CachedControlType() };
        if scope.viewport.is_none()
            && control_type == Ok(UIA_DocumentControlTypeId)
            && let Ok(bounds) = unsafe { element.CachedBoundingRectangle() }
        {
            let rect = rect_from(bounds);
            let area = rect.width * rect.height;
            if area > 0.0
                && largest_document
                    .as_ref()
                    .is_none_or(|(_, current)| area > current.width * current.height)
            {
                largest_document = Some((element.clone(), rect));
            }
        }
        let is_layout_container = matches!(
            control_type,
            Ok(control_type)
                if control_type == UIA_GroupControlTypeId
                    || control_type == UIA_PaneControlTypeId
                    || control_type == UIA_DocumentControlTypeId
                    || control_type == UIA_CustomControlTypeId
        );
        if !(is_control || is_content || is_layout_container) {
            continue;
        }
        let offscreen = unsafe { element.CachedIsOffscreen() }
            .map(windows::core::BOOL::as_bool)
            .unwrap_or(true);
        if offscreen && scope.viewport.is_none() {
            continue;
        }
        let Ok(bounds) = (unsafe { element.CachedBoundingRectangle() }) else {
            continue;
        };
        let raw = rect_from(bounds);
        let visible = match scope.viewport {
            Some(viewport) => clip_rect(raw, viewport),
            None => Some(raw),
        };
        let Some(rect) = visible else {
            continue;
        };
        if rect.width < MIN_REGION_SIZE || rect.height < MIN_REGION_SIZE {
            continue;
        }
        let is_relaxed_only = is_layout_container && !(is_control || is_content);
        if is_relaxed_only
            && scope.window_area > 0.0
            && rect.width * rect.height > scope.window_area * MAX_LAYOUT_CONTAINER_RATIO
        {
            continue;
        }
        let name = unsafe { element.CachedName() }
            .map(|value| value.to_string())
            .unwrap_or_else(|_| "UI region".into());
        regions.push(DetectedTargetDto {
            id: format!("{}-{}-{index}", scope.id_prefix, scope.window_id),
            title: if name.trim().is_empty() {
                "UI region".into()
            } else {
                name
            },
            kind: "ui-region",
            bounds: rect,
        });
    }
    Ok(largest_document)
}

fn rect_from(bounds: RECT) -> Rect {
    Rect {
        x: f64::from(bounds.left),
        y: f64::from(bounds.top),
        width: f64::from(bounds.right.saturating_sub(bounds.left).max(0)),
        height: f64::from(bounds.bottom.saturating_sub(bounds.top).max(0)),
    }
}

/// The part of `rect` inside `clip`, or `None` when they don't overlap.
fn clip_rect(rect: Rect, clip: Rect) -> Option<Rect> {
    let left = rect.x.max(clip.x);
    let top = rect.y.max(clip.y);
    let right = (rect.x + rect.width).min(clip.x + clip.width);
    let bottom = (rect.y + rect.height).min(clip.y + clip.height);
    (right > left && bottom > top).then_some(Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

/// Chromium (Chrome, Edge, Electron, WebView2) only builds a web page's
/// accessibility tree after an assistive tool asks for it. A UI Automation
/// query on the top-level window isn't enough; the standard request
/// (WM_GETOBJECT for the client object) sent to the page's own child window
/// is. The tree then fills in asynchronously. Returns how many page windows
/// were asked.
fn wake_web_content(window_id: u32) -> usize {
    use windows::Win32::{
        Foundation::{LPARAM, WPARAM},
        UI::WindowsAndMessaging::{
            OBJID_CLIENT, SMTO_ABORTIFHUNG, SendMessageTimeoutW, WM_GETOBJECT,
        },
    };

    let pages = web_content_windows(window_id);
    for page in &pages {
        let mut result = 0usize;
        unsafe {
            SendMessageTimeoutW(
                *page,
                WM_GETOBJECT,
                WPARAM(0),
                LPARAM(OBJID_CLIENT.0 as isize),
                SMTO_ABORTIFHUNG,
                200,
                Some(&mut result),
            );
        }
    }
    pages.len()
}

/// The child windows of `window_id` that host Chromium web pages.
fn web_content_windows(window_id: u32) -> Vec<HWND> {
    use windows::Win32::{Foundation::LPARAM, UI::WindowsAndMessaging::EnumChildWindows};

    unsafe extern "system" fn collect(child: HWND, found: LPARAM) -> windows::core::BOOL {
        // SAFETY: `found` is the address of the Vec passed below, alive for the whole enumeration.
        let found = unsafe { &mut *(found.0 as *mut Vec<HWND>) };
        let mut buffer = [0u16; 64];
        let length = unsafe { GetClassNameW(child, &mut buffer) };
        if length > 0 && String::from_utf16_lossy(&buffer[..length as usize]) == WEB_CONTENT_CLASS {
            found.push(child);
        }
        true.into()
    }

    let parent = HWND(window_id as usize as *mut c_void);
    let mut pages: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumChildWindows(
            Some(parent),
            Some(collect),
            LPARAM(&mut pages as *mut Vec<HWND> as isize),
        );
    }
    pages
}

/// Where the web page is on screen (physical pixels) inside `window_id` at `point`.
///
/// Chrome hosts each page in its own child window, so that window's rectangle is the page.
/// Some Chromium browsers (Aside, for example) draw the page into one shared surface with no
/// page window; there the page's UI Automation Document element gives the rectangle instead.
/// `None` when the window shows no web page there.
pub fn web_viewport_rect(window_id: u32, point: Point) -> Option<Rect> {
    page_window_rect(window_id, point).or_else(|| {
        if is_browser_window(window_id) {
            document_rect(window_id, point)
        } else {
            None
        }
    })
}

fn contains(rect: &Rect, point: Point) -> bool {
    rect.width > 0.0
        && rect.height > 0.0
        && point.x >= rect.x
        && point.x < rect.x + rect.width
        && point.y >= rect.y
        && point.y < rect.y + rect.height
}

/// The largest visible Chromium page window inside `window_id` that contains `point`.
fn page_window_rect(window_id: u32, point: Point) -> Option<Rect> {
    use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;

    web_content_windows(window_id)
        .into_iter()
        .filter(|page| unsafe { IsWindowVisible(*page) }.as_bool())
        .filter_map(|page| {
            let mut bounds = RECT::default();
            unsafe { GetWindowRect(page, &mut bounds) }.ok()?;
            Some(rect_from(bounds))
        })
        .filter(|rect| contains(rect, point))
        .max_by(|left, right| (left.width * left.height).total_cmp(&(right.width * right.height)))
}

/// The largest UI Automation Document element in `window_id` that contains `point`. Runs only
/// when the browser has no page window there. The walk takes tens of milliseconds, so the page
/// rectangles are reused for a short time while the window keeps the same position and size.
fn document_rect(window_id: u32, point: Point) -> Option<Rect> {
    use std::sync::Mutex;
    use std::time::Instant;

    struct Cached {
        window_id: u32,
        window: Rect,
        at: Instant,
        documents: Vec<Rect>,
    }
    static CACHE: Mutex<Option<Cached>> = Mutex::new(None);

    let mut bounds = RECT::default();
    unsafe { GetWindowRect(HWND(window_id as usize as *mut c_void), &mut bounds) }.ok()?;
    let window = rect_from(bounds);
    let pick = |documents: &[Rect]| -> Option<Rect> {
        documents
            .iter()
            .filter(|rect| contains(rect, point))
            .max_by(|left, right| {
                (left.width * left.height).total_cmp(&(right.width * right.height))
            })
            .copied()
    };

    let mut cache = CACHE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(cached) = cache.as_ref()
        && cached.window_id == window_id
        && cached.window == window
        && cached.at.elapsed() < DOCUMENT_CACHE_TTL
    {
        return pick(&cached.documents);
    }
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if initialized.is_err() {
        return None;
    }
    let documents = unsafe { find_documents(window_id) };
    unsafe { CoUninitialize() };
    let result = pick(&documents);
    *cache = Some(Cached {
        window_id,
        window,
        at: Instant::now(),
        documents,
    });
    result
}

/// Walks the browser's own UI (toolbars, panels) breadth first without entering pages, so the
/// walk stays small; a page's Document element sits a few levels below the window.
unsafe fn find_documents(window_id: u32) -> Vec<Rect> {
    let mut documents = Vec::new();
    let Ok(automation) = (unsafe {
        CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
    }) else {
        return documents;
    };
    let Ok(root) =
        (unsafe { automation.ElementFromHandle(HWND(window_id as usize as *mut c_void)) })
    else {
        return documents;
    };
    let Ok(walker) = (unsafe { automation.ControlViewWalker() }) else {
        return documents;
    };
    let mut queue = std::collections::VecDeque::from([root]);
    let mut visited = 0usize;
    while let Some(element) = queue.pop_front() {
        visited += 1;
        if visited > MAX_DOCUMENT_SEARCH_ELEMENTS {
            break;
        }
        if unsafe { element.CurrentControlType() } == Ok(UIA_DocumentControlTypeId) {
            if let Ok(bounds) = unsafe { element.CurrentBoundingRectangle() } {
                documents.push(rect_from(bounds));
            }
            continue;
        }
        let mut child = unsafe { walker.GetFirstChildElement(&element) }.ok();
        while let Some(current) = child {
            child = unsafe { walker.GetNextSiblingElement(&current) }.ok();
            queue.push_back(current);
        }
    }
    documents
}

fn rects_nearly_equal(left: &Rect, right: &Rect) -> bool {
    (left.x - right.x).abs() <= DEDUPE_TOLERANCE
        && (left.y - right.y).abs() <= DEDUPE_TOLERANCE
        && (left.width - right.width).abs() <= DEDUPE_TOLERANCE
        && (left.height - right.height).abs() <= DEDUPE_TOLERANCE
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn clip_keeps_the_visible_part_of_a_partly_scrolled_element() {
        let viewport = rect(0.0, 100.0, 800.0, 600.0);
        let clipped = clip_rect(rect(10.0, 60.0, 200.0, 80.0), viewport);
        assert_eq!(clipped, Some(rect(10.0, 100.0, 200.0, 40.0)));
    }

    #[test]
    fn clip_drops_an_element_scrolled_out_of_the_page() {
        let viewport = rect(0.0, 100.0, 800.0, 600.0);
        assert_eq!(clip_rect(rect(10.0, 0.0, 200.0, 90.0), viewport), None);
        assert_eq!(clip_rect(rect(10.0, 700.0, 200.0, 90.0), viewport), None);
    }
}
