#include <cassert>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>
#include <opencv2/imgproc.hpp>

#include "transverse_width_scorer.hpp"
#include "transverse_width_model.generated.hpp"

namespace {

bool sameQuad(const stripcv::Quad& first, const stripcv::Quad& second,
              double tolerance = 1.0e-5) {
  for (size_t index = 0; index < first.size(); ++index) {
    if (cv::norm(first[index] - second[index]) > tolerance) {
      return false;
    }
  }
  return true;
}

}  // namespace

int main() {
  assert(std::string(stripcv::internal::transverseWidthPolicyId()) ==
         "transverse-width-p1-base1-correct-s16-top-4");

  cv::Mat rgb(256, 64, CV_8UC3, cv::Scalar(32, 32, 32));
  cv::rectangle(rgb, cv::Rect(20, 18, 25, 220), cv::Scalar(225, 225, 225),
                cv::FILLED);
  cv::rectangle(rgb, cv::Rect(20, 18, 25, 92), cv::Scalar(238, 205, 220),
                cv::FILLED);
  const stripcv::Quad anchor = {
      cv::Point2f(44.0F, 18.0F), cv::Point2f(44.0F, 237.0F),
      cv::Point2f(20.0F, 237.0F), cv::Point2f(20.0F, 18.0F)};

  const auto first =
      stripcv::internal::scoreTransverseWidthHypotheses(rgb, anchor);
  const auto second =
      stripcv::internal::scoreTransverseWidthHypotheses(rgb, anchor);
  assert(first.size() >= 3 && first.size() <= 4);
  assert(second.size() == first.size());
  for (size_t index = 0; index < first.size(); ++index) {
    assert(sameQuad(first[index].corners, second[index].corners));
    assert(std::abs(first[index].model_score - second[index].model_score) <
           1.0e-9);
    assert(first[index].endpoint_rank >= 1 &&
           first[index].endpoint_rank <= 3);
  }
  assert(!first.front().width_corrected);
  if (first.size() == 4) {
    assert(first.back().width_corrected);
    assert(first.back().endpoint_rank == 1);
  }

  const nlohmann::json frozen = nlohmann::json::parse(
      stripcv::internal::kTransverseWidthModelJson);
  const auto expected = frozen.at("contract_fixture").at("outputs");
  assert(expected.size() == first.size());
  for (size_t output_index = 0; output_index < first.size(); ++output_index) {
    stripcv::Quad expected_corners{};
    const auto values = expected.at(output_index).at("corners_normalized");
    for (size_t corner = 0; corner < expected_corners.size(); ++corner) {
      expected_corners[corner] = cv::Point2f(
          values.at(corner).at(0).get<float>() * 63.0F,
          values.at(corner).at(1).get<float>() * 255.0F);
    }
    expected_corners = stripcv::orderQuad(expected_corners);
    assert(sameQuad(first[output_index].corners, expected_corners, 0.20));
    assert(std::abs(first[output_index].model_score -
                    expected.at(output_index).at("model_score").get<double>()) <
           2.0e-3);
    assert(first[output_index].endpoint_rank ==
           expected.at(output_index).at("endpoint_rank").get<int>());
    assert(first[output_index].width_corrected ==
           expected.at(output_index).at("width_corrected").get<bool>());
  }

  cv::Mat horizontal;
  cv::rotate(rgb, horizontal, cv::ROTATE_90_COUNTERCLOCKWISE);
  stripcv::Quad horizontal_anchor{};
  for (size_t index = 0; index < anchor.size(); ++index) {
    horizontal_anchor[index] = cv::Point2f(
        anchor[index].y, static_cast<float>(rgb.cols - 1) - anchor[index].x);
  }
  const auto rotated = stripcv::internal::scoreTransverseWidthHypotheses(
      horizontal, stripcv::orderQuad(horizontal_anchor));
  assert(rotated.size() == first.size());

  std::cout << "StripCV transverse-width scorer contract passed.\n";
  return 0;
}
