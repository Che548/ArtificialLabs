"""Require spatial absence support before a one-line report; unchanged band threshold."""
def decide(prediction):
    prior=prediction['routes']['consensus']
    if not prior['reportable'] or prior['observed_label']!='one_line':
        return dict(prior)
    test=prediction['geometry']['bands'][1]
    if test['score']>.1:
        return dict(observed_label='review',reportable=False,reason='spatial_test_absence_not_confirmed')
    return dict(prior,reason='window_readers_and_spatial_absence_agree')
