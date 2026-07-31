#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef _WIN32
#define STRIPCV_API __declspec(dllexport)
#else
#define STRIPCV_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

STRIPCV_API const char* stripcv_version(void);

// Analyze a packed RGB888 image. Returned strings are allocated by the library
// and must be released with stripcv_free_string.
STRIPCV_API int stripcv_analyze_rgb(const uint8_t* rgb, int width, int height,
                                    size_t row_stride,
                                    const char* assay_profile_json,
                                    const char* card_profile_json,
                                    const char* options_json,
                                    char** result_json,
                                    char** error_message);

STRIPCV_API void stripcv_free_string(char* value);

#ifdef __cplusplus
}
#endif

