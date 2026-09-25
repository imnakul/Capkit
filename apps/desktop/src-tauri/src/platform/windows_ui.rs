use std::{ffi::c_void, thread::sleep, time::Duration};

use windows::Win32::{
    Foundation::{HWND, RECT},
    System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    },
    UI::{
        Accessibility::{
            CUIAutomation, IUIAutomation, TreeScope_Descendants, UIA_BoundingRectanglePropertyId,
            UIA_ControlTypePropertyId, UIA_CustomControlTypeId, UIA_DocumentControlTypeId,
            UIA_GroupControlTypeId, UIA_IsContentElementPropertyId, UIA_IsControlElementPropertyId,
            UIA_IsOffscreenPropertyId, UIA_NamePropertyId, UIA_PaneControlTypeId,
        },
        WindowsAndMessaging::{GetClassNameW, GetWindowRect},
    },
};

use crate::{
    domain::{DetectedTargetDto, Rect},
    error::SnaphubError,
};

const MAX_CACHED_ELEMENTS: i32 = 4_000;
// Layout containers (Chromium maps a plain, role-less <div> to Group/Pane/Document/
// Custom) are only worth surfacing up to this fraction of the window; beyond that
// they're indistinguishable from "the whole page", which is already covered by the
// window-level target.
const MAX_LAYOUT_CONTAINER_RATIO: f64 = 0.9;
// Nested elements (a wrapper <div> around a single child) frequently share an
// identical bounding rect; keep only one of each near-duplicate.
const DEDUPE_TOLERANCE: f64 = 2.0;
// Chromium/Firefox activate their full accessibility tree lazily, in response to the
// first UIA query (WM_GETOBJECT). An immediate scan of a browser window often only
// sees the frame chrome, so we retry briefly if too few candidates come back.
const BROWSER_WINDOW_CLASSES: [&str; 2] = ["Chrome_WidgetWin_1", "MozillaWindowClass"];
const BROWSER_SCAN_MIN_REGIONS: usize = 6;
const BROWSER_SCAN_RETRIES: u32 = 2;
const BROWSER_SCAN_RETRY_DELAY: Duration = Duration::from_millis(180);

pub fn regions_for_window(window_id: u32) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
    // UI Automation objects are apartment-bound. Each bounded scan initializes and releases COM
    // on the worker thread that performs it; callers cache the resulting plain rectangles.
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if initialized.is_err() {
        return Err(SnaphubError::Capture(format!(
            "UI Automation could not initialize: {initialized:?}"
        )));
    }

    let mut result = unsafe { collect_regions(window_id) };
    if is_browser_window(window_id) {
        for _ in 0..BROWSER_SCAN_RETRIES {
            let needs_retry = match &result {
                Ok(regions) => regions.len() < BROWSER_SCAN_MIN_REGIONS,
                Err(_) => true,
            };
            if !needs_retry {
                break;
            }
            sleep(BROWSER_SCAN_RETRY_DELAY);
            let retry = unsafe { collect_regions(window_id) };
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

unsafe fn collect_regions(window_id: u32) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
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
    let elements = unsafe {
        root.FindAllBuildCache(TreeScope_Descendants, &condition, &cache_request)
            .map_err(SnaphubError::capture)?
    };
    let count =
        unsafe { elements.Length().map_err(SnaphubError::capture)? }.clamp(0, MAX_CACHED_ELEMENTS);
    let mut regions = Vec::with_capacity(count as usize);

    let mut window_rect = RECT::default();
    let window_area = if unsafe { GetWindowRect(window_handle, &mut window_rect) }.is_ok() {
        f64::from((window_rect.right - window_rect.left).max(0))
            * f64::from((window_rect.bottom - window_rect.top).max(0))
    } else {
        0.0
    };

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
        let is_layout_container = matches!(
            unsafe { element.CachedControlType() },
            Ok(control_type)
                if control_type == UIA_GroupControlTypeId
                    || control_type == UIA_PaneControlTypeId
                    || control_type == UIA_DocumentControlTypeId
                    || control_type == UIA_CustomControlTypeId
        );
        if !(is_control || is_content || is_layout_container)
            || unsafe { element.CachedIsOffscreen() }
                .map(windows::core::BOOL::as_bool)
                .unwrap_or(true)
        {
            continue;
        }
        let Ok(bounds) = (unsafe { element.CachedBoundingRectangle() }) else {
            continue;
        };
        let width = bounds.right.saturating_sub(bounds.left);
        let height = bounds.bottom.saturating_sub(bounds.top);
        if width < 6 || height < 6 {
            continue;
        }
        let is_relaxed_only = is_layout_container && !(is_control || is_content);
        if is_relaxed_only && window_area > 0.0 {
            let area = f64::from(width) * f64::from(height);
            if area > window_area * MAX_LAYOUT_CONTAINER_RATIO {
                continue;
            }
        }
        let name = unsafe { element.CachedName() }
            .map(|value| value.to_string())
            .unwrap_or_else(|_| "UI region".into());
        regions.push(DetectedTargetDto {
            id: format!("ui-{window_id}-{index}"),
            title: if name.trim().is_empty() {
                "UI region".into()
            } else {
                name
            },
            kind: "ui-region",
            bounds: Rect {
                x: f64::from(bounds.left),
                y: f64::from(bounds.top),
                width: f64::from(width),
                height: f64::from(height),
            },
        });
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

fn rects_nearly_equal(left: &Rect, right: &Rect) -> bool {
    (left.x - right.x).abs() <= DEDUPE_TOLERANCE
        && (left.y - right.y).abs() <= DEDUPE_TOLERANCE
        && (left.width - right.width).abs() <= DEDUPE_TOLERANCE
        && (left.height - right.height).abs() <= DEDUPE_TOLERANCE
}
