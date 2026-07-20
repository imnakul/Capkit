use std::ffi::c_void;

use windows::Win32::{
    Foundation::HWND,
    System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    },
    UI::Accessibility::{
        CUIAutomation, IUIAutomation, TreeScope_Descendants, UIA_BoundingRectanglePropertyId,
        UIA_IsControlElementPropertyId, UIA_IsOffscreenPropertyId, UIA_NamePropertyId,
    },
};

use crate::{
    domain::{DetectedTargetDto, Rect},
    error::SnaphubError,
};

const MAX_CACHED_ELEMENTS: i32 = 4_000;

pub fn regions_for_window(window_id: u32) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
    // UI Automation objects are apartment-bound. Each bounded scan initializes and releases COM
    // on the worker thread that performs it; callers cache the resulting plain rectangles.
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if initialized.is_err() {
        return Err(SnaphubError::Capture(format!(
            "UI Automation could not initialize: {initialized:?}"
        )));
    }

    let result = unsafe { collect_regions(window_id) };
    unsafe { CoUninitialize() };
    result
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

    for index in 0..count {
        let Ok(element) = (unsafe { elements.GetElement(index) }) else {
            continue;
        };
        if !unsafe { element.CachedIsControlElement() }
            .map(windows::core::BOOL::as_bool)
            .unwrap_or(false)
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
    Ok(regions)
}
