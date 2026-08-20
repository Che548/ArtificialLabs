#pragma once

#include <vector>

#include <opencv2/core.hpp>

#include "stripcv/types.hpp"

namespace stripcv::internal {

// The learned policy is an additive geometry-proposal source. It never emits
// a line classification and cannot bypass the classical refinement, content,
// multi-strip, or quality gates.
struct TransverseWidthHypothesis {
  Quad corners{};
  double model_score = 0.0;
  int endpoint_rank = 0;
  bool width_corrected = false;
};

std::vector<TransverseWidthHypothesis> scoreTransverseWidthHypotheses(
    const cv::Mat& rgb, const Quad& classical_anchor);

const char* transverseWidthPolicyId();

}  // namespace stripcv::internal
