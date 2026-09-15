Json read_local_bands(const cv::Mat& window, cv::dnn::Net& model) {
  const auto logits = forward(model, input_blob(window, true), {1, 96});
  std::array<float, 96> columns;
  for (int x = 0; x < 96; ++x) columns[x] = sigmoid(logits.ptr<float>()[x]);
  std::array<float, 384> profile;
  for (int x = 0; x < 384; ++x) {
    const int lo = x / 4, hi = std::min(lo + 1, 95);
    profile[x] = columns[lo] + (columns[hi] - columns[lo]) * ((x % 4) / 4.f);
  }
  // Positional ranges are frozen from the local model's original training data.
  constexpr double control_lo = .14139491777485635, control_hi = .47554585152838436;
  constexpr double test_lo = .403185, test_hi = .7681466474125482;
  int ci = 0, ti = 0; float c = 0, t = 0, extra = 0;
  for (int x = 0; x < 384; ++x) {
    const double u = (x - 31.5) / 320;
    if (u >= control_lo && u <= control_hi && profile[x] > c) { c = profile[x]; ci = x; }
  }
  for (int x = 0; x < 384; ++x) {
    const double u = (x - 31.5) / 320;
    if (u >= test_lo && u <= test_hi && x >= ci + 24 && profile[x] > t) { t = profile[x]; ti = x; }
  }
  for (int x = 0; x < 384; ++x) {
    const double u = (x - 31.5) / 320;
    if (u >= 0 && u <= 1 && std::abs(x - ci) > 24 && std::abs(x - ti) > 24)
      extra = std::max(extra, profile[x]);
  }
  return {{"bandScores", {c, t}}, {"extraBandScore", extra}, {"bandPositionsInput", {ci, ti}}};
}
// Independent geometry and a spatially local band reader. Included inside the reader's private namespace.
float window_quantile(std::vector<float> values, double fraction) {
  std::sort(values.begin(), values.end());
  const double index = fraction * (values.size() - 1);
  const size_t lo = static_cast<size_t>(index), hi = std::min(lo + 1, values.size() - 1);
  return static_cast<float>(values[lo] + (values[hi] - values[lo]) * (index - lo));
}
struct IndependentWindow {
  Json evidence = nullptr;
  int count = 0;
};
IndependentWindow independent_window(const cv::Mat& rgb, const std::array<float, 4>& box,
                                     cv::dnn::Net& model) {
  const int x0 = std::max(0, static_cast<int>(box[0])), y0 = std::max(0, static_cast<int>(box[1]));
  const int x1 = std::min(rgb.cols, static_cast<int>(box[2])), y1 = std::min(rgb.rows, static_cast<int>(box[3]));
  if (x1 <= x0 || y1 <= y0) return {};
  cv::Mat patch = rgb(cv::Rect(x0, y0, x1 - x0, y1 - y0));
  const bool rotated = patch.rows > patch.cols;
  const int original_height = patch.rows;
  cv::Matx33d to_source(1, 0, x0, 0, 1, y0, 0, 0, 1);
  if (rotated) {
    cv::rotate(patch, patch, cv::ROTATE_90_CLOCKWISE);
    to_source = cv::Matx33d(0, 1, x0, -1, 0, y0 + original_height - 1, 0, 0, 1);
  }
  const int h = patch.rows, w = patch.cols;
  if (h < 12 || static_cast<double>(w) / h < 5) return {};
  std::vector<float> green(w);
  for (int x = 0; x < w; ++x) {
    std::vector<float> column;
    for (int y = static_cast<int>(h * .38); y <= static_cast<int>(h * .62); ++y)
      column.push_back(patch.at<cv::Vec3b>(y, x)[1]);
    green[x] = median(std::move(column));
  }
  const float reference = window_quantile(green, .9), threshold = reference * .9f;
  cv::Mat mask(1, w, CV_8U);
  for (int x = 0; x < w; ++x) mask.at<unsigned char>(0, x) = green[x] >= threshold ? 255 : 0;
  cv::morphologyEx(mask, mask, cv::MORPH_CLOSE,
                  cv::Mat::ones(1, 2 * static_cast<int>(w * .01) + 1, CV_8U));
  int a = 0, b = 0, run = -1;
  for (int x = 0; x <= w; ++x) {
    if (x < w && mask.at<unsigned char>(0, x)) { if (run < 0) run = x; }
    else if (run >= 0) { if (x - run > b - a) { a = run; b = x; } run = -1; }
  }
  if (b - a < .15 * w || a < .04 * w || b > .96 * w) return {};
  std::vector<cv::Point2f> centers;
  std::vector<float> widths;
  for (int x = a; x < b; ++x) {
    std::vector<float> ys;
    for (int y = 0; y < h; ++y) if (patch.at<cv::Vec3b>(y, x)[1] >= threshold) ys.push_back(y);
    if (ys.size() < h * .15) continue;
    centers.emplace_back(static_cast<float>(x), median(ys));
    widths.push_back((window_quantile(ys, .9) - window_quantile(ys, .1) + 1) / .8f);
  }
  if (centers.size() < .7 * (b - a)) return {};
  cv::Vec4f axis_fit;
  cv::fitLine(centers, axis_fit, cv::DIST_HUBER, 0, .01, .01);
  const double vx = axis_fit[0], vy = axis_fit[1], xx = axis_fit[2], yy = axis_fit[3];
  if (!std::isfinite(vx) || std::abs(vx) < 1e-6) return {};
  const auto axis_y = [&](double x) { return yy + (x - xx) * vy / vx; };
  const double paper_width = median(widths);
  std::vector<float> residuals;
  for (const auto& p : centers) residuals.push_back(static_cast<float>(std::abs(p.y - axis_y(p.x))));
  const double residual = median(std::move(residuals));
  if (paper_width < 8 || residual > paper_width * .12) return {};
  const double left = median(std::vector<float>(green.begin(), green.begin() + a));
  const double right = median(std::vector<float>(green.begin() + b, green.end()));
  if (reference <= 0 || std::abs(right - left) < .15 * reference) return {};
  const bool handle_right = right < left;
  const cv::Point2d begin(handle_right ? b : a, axis_y(handle_right ? b : a));
  const cv::Point2d end(handle_right ? a : b, axis_y(handle_right ? a : b));
  const double length = cv::norm(end - begin);
  const auto along = (end - begin) / length;
  const cv::Point2d across(-along.y, along.x), center = (begin + end) / 2;
  const double scale = 384 / (1.2 * length);
  const cv::Matx33d transform(along.x * scale, along.y * scale, 191.5 - center.dot(along) * scale,
                              across.x * scale, across.y * scale, 63.5 - center.dot(across) * scale,
                              0, 0, 1);
  cv::Mat floating, window;
  patch.convertTo(floating, CV_32FC3, 1.0 / 255);
  cv::warpAffine(floating, window, cv::Mat(transform).rowRange(0, 2), cv::Size(384, 128),
                 cv::INTER_LINEAR, cv::BORDER_CONSTANT, cv::Scalar(.447, .447, .447));
  const auto local = read_local_bands(window, model);
  const float c = local["bandScores"][0], t = local["bandScores"][1], extra = local["extraBandScore"];
  const int ci = local["bandPositionsInput"][0], ti = local["bandPositionsInput"][1];
  const auto inverse = to_source * transform.inv();
  Json source_points = Json::array();
  for (int x : {ci, ti}) {
    const auto point = inverse * cv::Vec3d(x, 63.5, 1);
    source_points.push_back({point[0] / point[2], point[1] / point[2]});
  }
  Json evidence = {{"boundedWindow", true}, {"paperWidthPx", paper_width}, {"axisResidualPx", residual},
                   {"orientationContrast", std::abs(right - left) / reference},
                   {"whiteFraction", static_cast<double>(b - a) / w},
                   {"boundaryFractions", {static_cast<double>(a) / w, static_cast<double>(w - b) / w}},
                   {"bandScores", {c, t}}, {"extraBandScore", extra},
                   {"bandPositionsSource", source_points}, {"windowSourceToInput", matrix_json(transform * to_source.inv())}};
  int count = 0;
  if (c >= .9 && extra < .9) { if (t >= .9) count = 2; else if (t <= .1) count = 1; }
  return {evidence, count};
}
