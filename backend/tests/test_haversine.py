from app.services.haversine import haversine_m
def test_same_point():
    assert haversine_m(2.443,-76.606,2.443,-76.606)==0
def test_tulcan_pandiguando():
    d=haversine_m(2.443,-76.606,2.445,-76.610)
    assert 400 < d < 600, d
def test_centro_tulcan():
    d=haversine_m(2.443,-76.606,2.441,-76.606)
    assert 200 < d < 300, d
