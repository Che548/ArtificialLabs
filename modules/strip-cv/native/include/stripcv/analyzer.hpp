#pragma once

#include <memory>

#include <opencv2/core.hpp>

#include "stripcv/locator.hpp"
#include "stripcv/types.hpp"

namespace stripcv {

class Analyzer {
 public:
  explicit Analyzer(std::shared_ptr<const IRegionLocator> locator = nullptr);

  AnalysisResult analyze(const cv::Mat& rgb, const AssayProfile& assay,
                         const AnalysisOptions& options = {}) const;

 private:
  std::shared_ptr<const IRegionLocator> locator_;
};

}  // namespace stripcv
