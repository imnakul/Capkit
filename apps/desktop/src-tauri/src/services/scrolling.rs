use image::{ImageBuffer, RgbaImage, imageops};

use crate::error::SnaphubError;

pub struct StitchResult {
    pub image: RgbaImage,
    pub sticky_header_height: u32,
}

/// Stitches vertical frames by finding the lowest-error overlapping row range.
/// Capture and scroll input remain platform adapters; this worker is deterministic and testable.
pub fn stitch_vertical(
    frames: &[RgbaImage],
    minimum_overlap: u32,
    maximum_overlap: u32,
) -> Result<RgbaImage, SnaphubError> {
    stitch_vertical_with_metadata(frames, minimum_overlap, maximum_overlap)
        .map(|result| result.image)
}

pub fn stitch_vertical_with_metadata(
    frames: &[RgbaImage],
    minimum_overlap: u32,
    maximum_overlap: u32,
) -> Result<StitchResult, SnaphubError> {
    let first = frames
        .first()
        .ok_or_else(|| SnaphubError::Capture("Scrolling capture produced no frames".into()))?;
    if frames.iter().any(|frame| frame.width() != first.width()) {
        return Err(SnaphubError::Capture(
            "Scrolling frames have inconsistent widths".into(),
        ));
    }

    let sticky_header_height = detect_sticky_header(frames);
    let prepared = frames
        .iter()
        .enumerate()
        .map(|(index, frame)| {
            if index == 0 || sticky_header_height == 0 {
                frame.clone()
            } else {
                imageops::crop_imm(
                    frame,
                    0,
                    sticky_header_height,
                    frame.width(),
                    frame.height() - sticky_header_height,
                )
                .to_image()
            }
        })
        .collect::<Vec<_>>();
    let overlaps = prepared
        .windows(2)
        .map(|pair| best_overlap(&pair[0], &pair[1], minimum_overlap, maximum_overlap))
        .collect::<Vec<_>>();
    let output_height = prepared.iter().map(ImageBuffer::height).sum::<u32>()
        - overlaps.iter().copied().sum::<u32>();
    let mut output = RgbaImage::new(first.width(), output_height);
    let mut y = 0_i64;
    for (index, frame) in prepared.iter().enumerate() {
        let overlap = if index == 0 { 0 } else { overlaps[index - 1] };
        let visible =
            imageops::crop_imm(frame, 0, overlap, frame.width(), frame.height() - overlap)
                .to_image();
        imageops::overlay(&mut output, &visible, 0, y);
        y += i64::from(visible.height());
    }
    Ok(StitchResult {
        image: output,
        sticky_header_height,
    })
}

pub fn frames_are_unchanged(previous: &RgbaImage, next: &RgbaImage) -> bool {
    if previous.dimensions() != next.dimensions() {
        return false;
    }
    let step_x = (previous.width() / 80).max(1) as usize;
    let step_y = (previous.height() / 80).max(1) as usize;
    let mut difference = 0_u64;
    let mut samples = 0_u64;
    for y in (0..previous.height()).step_by(step_y) {
        for x in (0..previous.width()).step_by(step_x) {
            let left = previous.get_pixel(x, y).0;
            let right = next.get_pixel(x, y).0;
            difference += left
                .iter()
                .zip(right.iter())
                .take(3)
                .map(|(a, b)| u64::from(a.abs_diff(*b)))
                .sum::<u64>();
            samples += 3;
        }
    }
    difference / samples.max(1) <= 1
}

fn detect_sticky_header(frames: &[RgbaImage]) -> u32 {
    if frames.len() < 2 {
        return 0;
    }
    let maximum = frames[0].height().min(240) / 3;
    let common = frames.windows(2).fold(maximum, |current, pair| {
        current.min(matching_prefix_rows(&pair[0], &pair[1], maximum))
    });
    if common >= 12 { common } else { 0 }
}

fn matching_prefix_rows(previous: &RgbaImage, next: &RgbaImage, maximum: u32) -> u32 {
    let sample_step = (previous.width() / 96).max(1) as usize;
    let mut matching = 0;
    for row in 0..maximum.min(previous.height()).min(next.height()) {
        let mut difference = 0_u64;
        let mut samples = 0_u64;
        for column in (0..previous.width()).step_by(sample_step) {
            let left = previous.get_pixel(column, row).0;
            let right = next.get_pixel(column, row).0;
            difference += left
                .iter()
                .zip(right.iter())
                .take(3)
                .map(|(a, b)| u64::from(a.abs_diff(*b)))
                .sum::<u64>();
            samples += 3;
        }
        if difference / samples.max(1) > 3 {
            break;
        }
        matching += 1;
    }
    matching
}

fn best_overlap(
    previous: &RgbaImage,
    next: &RgbaImage,
    minimum_overlap: u32,
    maximum_overlap: u32,
) -> u32 {
    let upper = maximum_overlap.min(previous.height()).min(next.height());
    let lower = minimum_overlap.min(upper);
    if upper == 0 {
        return 0;
    }

    // Searching every row of every candidate overlap is quadratic in frame height and made a
    // tall capture spend tens of seconds in post-processing. First sample at most ~180 evenly
    // spaced candidates, then refine only the winning neighborhood at single-pixel precision.
    let coarse_step = ((upper - lower) / 180).max(1);
    let coarse = (lower..=upper)
        .step_by(coarse_step as usize)
        .min_by_key(|overlap| overlap_error(previous, next, *overlap))
        .unwrap_or(lower);
    let refine_start = coarse.saturating_sub(coarse_step).max(lower);
    let refine_end = coarse.saturating_add(coarse_step).min(upper);
    (refine_start..=refine_end)
        .min_by_key(|overlap| overlap_error(previous, next, *overlap))
        .unwrap_or(coarse)
}

fn overlap_error(previous: &RgbaImage, next: &RgbaImage, overlap: u32) -> u64 {
    let previous_start = previous.height() - overlap;
    let row_step = (overlap / 48).max(1) as usize;
    let column_step = (previous.width() / 72).max(1) as usize;
    let mut error = 0_u64;
    let mut samples = 0_u64;
    for row in (0..overlap).step_by(row_step) {
        for column in (0..previous.width()).step_by(column_step) {
            let left = previous.get_pixel(column, previous_start + row).0;
            let right = next.get_pixel(column, row).0;
            error += left
                .iter()
                .zip(right.iter())
                .take(3)
                .map(|(a, b)| u64::from(a.abs_diff(*b)))
                .sum::<u64>();
            samples += 3;
        }
    }
    error / samples.max(1)
}

#[cfg(test)]
mod tests {
    use image::Rgba;

    use super::*;

    fn rows(values: &[u8]) -> RgbaImage {
        ImageBuffer::from_fn(2, values.len() as u32, |_x, y| {
            let value = values[y as usize];
            Rgba([value, value, value, 255])
        })
    }

    #[test]
    fn stitches_matching_overlap_once() {
        let first = rows(&[10, 20, 30, 40]);
        let second = rows(&[30, 40, 50, 60]);
        let stitched = stitch_vertical(&[first, second], 1, 3).expect("frames should stitch");
        assert_eq!(stitched.height(), 6);
        assert_eq!(stitched.get_pixel(0, 4), &Rgba([50, 50, 50, 255]));
    }

    #[test]
    fn rejects_inconsistent_widths() {
        let result = stitch_vertical(&[RgbaImage::new(2, 2), RgbaImage::new(3, 2)], 1, 1);
        assert!(result.is_err());
    }

    #[test]
    fn removes_a_repeated_sticky_header_after_the_first_frame() {
        let mut first_rows = vec![5; 12];
        first_rows.extend(20..50);
        let mut second_rows = vec![5; 12];
        second_rows.extend(40..70);
        let result = stitch_vertical_with_metadata(&[rows(&first_rows), rows(&second_rows)], 4, 15)
            .expect("sticky frames should stitch");
        assert_eq!(result.sticky_header_height, 12);
        assert_eq!(
            result.image.height(),
            62,
            "the repeated header is emitted only once"
        );
    }

    #[test]
    fn detects_unchanged_frames_at_scroll_end() {
        let frame = rows(&[10, 20, 30, 40]);
        assert!(frames_are_unchanged(&frame, &frame));
    }

    #[test]
    fn finds_overlap_in_large_frames_with_bounded_sampling() {
        fn patterned_frame(start_row: u32) -> RgbaImage {
            ImageBuffer::from_fn(720, 600, |x, y| {
                let value = ((x.wrapping_mul(17) + (y + start_row).wrapping_mul(29)) % 251) as u8;
                Rgba([value, value.wrapping_mul(3), value.wrapping_mul(7), 255])
            })
        }
        let first = patterned_frame(0);
        let second = patterned_frame(300);
        assert_eq!(best_overlap(&first, &second, 16, 480), 300);
    }
}
