#pragma once

#include <memory>
#include <string>

#include <opencv2/core.hpp>

#include "stripcv/types.hpp"

namespace stripcv {

struct LocalizationResult {
  bool found = false;
  std::string mode = "none";
  Quad corners{};
  cv::Mat homography;
  double confidence = 0.0;
  double area_fraction = 0.0;
  double edge_support_fraction = 0.0;
  double rectification_rmse_px = 0.0;
  double reprojection_rmse_px = 0.0;
  double holdout_rmse_px = 0.0;
  double perspective_scale_ratio = 1.0;
  std::string failure_reason;
};

class IRegionLocator {
 public:
  virtual ~IRegionLocator() = default;
  virtual LocalizationResult locateBare(const cv::Mat& rgb,
                                        const AssayProfile& assay) const = 0;
  virtual LocalizationResult locateCard(const cv::Mat& rgb,
                                        const CardProfile& card) const = 0;
};

class ClassicalRegionLocator final : public IRegionLocator {
 public:
  LocalizationResult locateBare(const cv::Mat& rgb,
                                const AssayProfile& assay) const override;
  LocalizationResult locateCard(const cv::Mat& rgb,
                                const CardProfile& card) const override;
};

class OnnxRegionLocator final : public IRegionLocator {
 public:
  explicit OnnxRegionLocator(std::string model_path);
  LocalizationResult locateBare(const cv::Mat& rgb,
                                const AssayProfile& assay) const override;
  LocalizationResult locateCard(const cv::Mat& rgb,
                                const CardProfile& card) const override;

 private:
  std::string model_path_;
};

}  // namespace stripcv
