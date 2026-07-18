use image::{ImageBuffer, RgbaImage, imageops};

use crate::error::ShotHubError;

/// Stitches vertical frames by finding the lowest-error overlapping row range.
/// Capture and scroll input remain platform adapters; this worker is deterministic and testable.
pub fn stitch_vertical(
    frames: &[RgbaImage],
    minimum_overlap: u32,
    maximum_overlap: u32,
) -> Result<RgbaImage, ShotHubError> {
    let first = frames
        .first()
        .ok_or_else(|| ShotHubError::Capture("Scrolling capture produced no frames".into()))?;
    if frames.iter().any(|frame| frame.width() != first.width()) {
        return Err(ShotHubError::Capture(
            "Scrolling frames have inconsistent widths".into(),
        ));
    }

    let overlaps = frames
        .windows(2)
        .map(|pair| best_overlap(&pair[0], &pair[1], minimum_overlap, maximum_overlap))
        .collect::<Vec<_>>();
    let output_height =
        frames.iter().map(ImageBuffer::height).sum::<u32>() - overlaps.iter().copied().sum::<u32>();
    let mut output = RgbaImage::new(first.width(), output_height);
    let mut y = 0_i64;
    for (index, frame) in frames.iter().enumerate() {
        let overlap = if index == 0 { 0 } else { overlaps[index - 1] };
        let visible =
            imageops::crop_imm(frame, 0, overlap, frame.width(), frame.height() - overlap)
                .to_image();
        imageops::overlay(&mut output, &visible, 0, y);
        y += i64::from(visible.height());
    }
    Ok(output)
}

fn best_overlap(
    previous: &RgbaImage,
    next: &RgbaImage,
    minimum_overlap: u32,
    maximum_overlap: u32,
) -> u32 {
    let upper = maximum_overlap.min(previous.height()).min(next.height());
    let lower = minimum_overlap.min(upper);
    let sample_step = (previous.width() / 96).max(1) as usize;
    (lower..=upper)
        .min_by_key(|overlap| {
            let mut error = 0_u64;
            let previous_start = previous.height() - overlap;
            for row in 0..*overlap {
                for column in (0..previous.width()).step_by(sample_step) {
                    let left = previous.get_pixel(column, previous_start + row).0;
                    let right = next.get_pixel(column, row).0;
                    error += left
                        .iter()
                        .zip(right.iter())
                        .take(3)
                        .map(|(a, b)| u64::from(a.abs_diff(*b)))
                        .sum::<u64>();
                }
            }
            error / u64::from((*overlap).max(1))
        })
        .unwrap_or(0)
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
}
