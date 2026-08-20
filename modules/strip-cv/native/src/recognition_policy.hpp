#pragma once

#include "stripcv/types.hpp"

namespace stripcv::internal {

inline bool unsupportedTinyRelativeTestSignal(
    const PeakMetrics& control, const PeakMetrics& test,
    double expected_line_width, double minimum_test_snr) {
  return control.detected && test.detected &&
         test.area < 0.003 * control.area &&
         test.fwhm < 0.50 * expected_line_width &&
         test.snr < 2.0 * minimum_test_snr;
}

}  // namespace stripcv::internal
