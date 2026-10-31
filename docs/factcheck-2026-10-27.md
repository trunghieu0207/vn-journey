# Báo cáo kiểm chứng câu hỏi — Ngày Văn hóa Việt Nam 24/11/2026

Ngày kiểm tra: 27/10/2026. Phạm vi: 204 câu hỏi trong `data/questions.json` và trường `adminCenterAt`/`collections.unesco` trong `data/provinces.json`.

## 1. Tóm tắt

| Kết quả | Số câu |
|---|---|
| Đúng (không cần sửa) | 199 |
| Cần sửa | 3 (lai-chau-s2, lai-chau-s1, vinh-long-s1) |
| Mơ hồ / nên viết lại | 2 (vinh-long-s2, ca-mau-02) |
| Không xác minh được | 0 |

Phương pháp (nói rõ để minh bạch): các mục ưu tiên đã được tra web với nguồn cụ thể: số liệu, dân tộc, năm UNESCO, toàn bộ `adminCenterAt`, Then Kin Pang, Phúc Sen, Bom Bo, cà chít, nhà trăm cột, sâm Lai Châu, Văn Miếu Trấn Biên, Cát Tiên, Pu Ta Leng, Vịnh Mốc, Dạ cổ hoài lang, Đồng khởi, Ao Bà Om, Cửa Vạn, "Thủ đô gió ngàn". Còn khoảng 170 câu về kiến thức phổ thông, rất phổ biến (ví dụ Hoàng thành 2010, Giỗ Tổ 10/3, cầu Hiền Lương – Bến Hải, Fansipan 3.143 m, Tràng An 2014, Nhã nhạc 2003, Đờn ca tài tử 2013, Ví Giặm 2014, Ok Om Bok…) thì chỉ đối chiếu với kiến thức đã biết và không ghi URL riêng cho từng câu. Không phát hiện điểm sai nào trong nhóm này.

## 2. Cần sửa

| id | Vấn đề | Thông tin đúng | Đề xuất sửa | Nguồn |
|---|---|---|---|---|
| **lai-chau-s2** | **Đáp án SAI.** Câu hỏi đánh dấu Then Kin Pang là lễ hội của người **Lự** (answer = 2). | Then Kin Pang là lễ hội của người **Thái (Thái Trắng)** ở xã Khổng Lào, huyện Phong Thổ cũ, Lai Châu. Lễ hội được tổ chức khoảng ngày 8–10 tháng 3 âm lịch, có nghi thức gội đầu, té nước. Lễ hội đã được Bộ VHTTDL công nhận là Di sản văn hóa phi vật thể quốc gia. Không nguồn nào gắn lễ hội này với người Lự. | `answer: 0` (Thái). Explanation mới: "Then Kin Pang (lễ hội cúng Then – Thần Trời) là lễ hội của người Thái Trắng ở Khổng Lào, Phong Thổ (Lai Châu), cầu mưa thuận gió hòa, sức khỏe, bình an; nổi bật với nghi thức gội đầu và té nước." Nếu vẫn muốn có một câu về người Lự thì nên viết câu mới (ví dụ về người Lự ở Bình Lư, Tam Đường). | https://baovanhoa.vn/dan-toc-ton-giao/le-hoi-then-kin-pang-mang-dam-ban-sac-cua-nguoi-thai-trang-90838.html ; https://nhandan.vn/sap-dien-ra-le-hoi-lon-nhat-cua-nguoi-thai-o-lai-chau-post869303.html ; https://vov5.vov.gov.vn/colorful-vietnam-vietnams-54-ethnic-groups/then-kin-pang-festival-celebrates-thai-ethnic-culture-and-community-spirit-2211219.vov5 ; https://baovanhoa.vn/dan-toc-ton-giao/lai-chau-co-them-4-di-san-van-hoa-phi-vat-the-quoc-gia-152064.html |
| **lai-chau-s1** | Đáp án 3.049 m đúng, nhưng **explanation sai**: ghi Pu Ta Leng "chỉ sau Fansipan (3.143 m)". | Đỉnh cao thứ hai Việt Nam là **Pu Si Lung** (Mường Tè, Lai Châu), khoảng 3.076–3.083 m. Pu Ta Leng (3.049 m) xếp **thứ ba**. | Giữ `answer: 1`. Explanation mới: "Pu Ta Leng cao khoảng 3.049 m, là một trong ba đỉnh cao nhất Việt Nam, sau Fansipan (3.143 m) và Pu Si Lung (khoảng 3.076–3.083 m)." | https://baolaocai.vn/hon-200-van-dong-vien-tham-gia-giai-leo-nui-chinh-phuc-dinh-pu-ta-leng-dai-ngan-hoa-do-quyen-xa-muong-hum-lan-thu-i-nam-2026-post897094.html (Pu Ta Leng: "một trong 3 đỉnh núi cao nhất Việt Nam, sau Fansipan và Pu Si Lung") |
| **vinh-long-s1** | Phương án đúng ghi "Cuộc thi **đắp đập** giữa nam và nữ", trong khi chính explanation và truyền thuyết đều nói là thi **đào ao**. Phương án hiện tại sai lệch nội dung. | Truyền thuyết Khmer kể về cuộc thi **đào ao** giữa phe nam và phe nữ. Bà Om dẫn đầu phe nữ, dùng mẹo treo đèn giả sao Mai, nhờ đó phe nữ thắng. | Sửa `options[0]` thành "Cuộc thi đào ao giữa nam và nữ" và giữ `answer: 0`. | https://vnexpress.net/thang-canh-ao-ba-om-2936068.html ; https://baophapluat.vn/truyen-thuyet-ve-ao-ba-om-va-ngoi-co-tu-linh-thieng-bac-nhat-mien-tay-post335104.html |

## 3. Mơ hồ / nên viết lại

| id | Lý do | Đề xuất | Nguồn |
|---|---|---|---|
| vinh-long-s2 | Câu hỏi viết "Đồng khởi năm 1960 **bùng nổ đầu tiên** ở tỉnh cũ nào?". Bến Tre (17/1/1960, Mỏ Cày) là đáp án chuẩn trong 4 phương án, nhưng trước đó đã có các cuộc khởi nghĩa ở Bác Ái (Ninh Thuận, 2/1959), Trà Bồng (Quảng Ngãi, 8/1959) và Vĩnh Thạnh (Bình Định). Người am hiểu lịch sử có thể bắt bẻ chữ "đầu tiên". | Viết lại thành: "Phong trào Đồng khởi bắt đầu ngày 17/1/1960 tại huyện Mỏ Cày thuộc tỉnh cũ nào?" hoặc "…tỉnh nào được coi là quê hương/ngọn cờ đầu của phong trào Đồng khởi?". Giữ đáp án Bến Tre. | https://baovanhoa.vn/doi-song/ngay-ben-tre-dong-khoi-197986.html ; https://en.wikipedia.org/wiki/%C4%90%E1%BB%93ng_Kh%E1%BB%9Fi_Movement |
| ca-mau-02 | Đáp án "Dạ cổ hoài lang" đúng. Riêng năm sáng tác "(1919)" ghi trong explanation còn tranh cãi: các tài liệu ghi 1917, 1918, 1919 hoặc 1920; Báo Văn Hóa ghi 1918. | Đổi explanation thành "khoảng 1918–1919" hoặc bỏ năm. Năm này không ảnh hưởng đến đáp án. | https://tuoitre.vn/dap-an-de-thi-gay-tranh-cai-da-co-hoai-lang-la-bai-ca-co-20231221185314495.htm |

Ghi chú nhỏ (không cần sửa):
- **lai-chau-02**: cả 4 phương án (Ô Quy Hồ, Pha Đin, Khau Phạ, Mã Pí Lèng) đều thuộc "tứ đại đỉnh đèo". Câu hỏi vẫn không mơ hồ vì chỉ Ô Quy Hồ nối Lai Châu với Sa Pa.
- **tay-ninh-s2** (nhà trăm cột): con số 120 cột (68 cột tròn, 52 cột vuông) là thống nhất giữa các nguồn. Các nguồn ghi loại gỗ khác nhau, nên giữ cách viết chung "gỗ quý" như hiện tại là hợp lý. Nguồn: https://www.sggp.org.vn/nha-tram-cot-110067.html ; https://mia.vn/cam-nang-du-lich/di-tich-nha-tram-cot-long-an-14126
- **quang-tri-s2**: tầng sâu nhất của địa đạo Vịnh Mốc ghi "khoảng 23 m"; các nguồn ghi 21–23 m, chấp nhận được. Nguồn: https://www.vietnamplus.vn/dia-dao-vinh-moc-luu-giu-ky-uc-chien-tranh-trao-truyen-khat-vong-hoa-binh-post1133040.vnp

### Các điểm ưu tiên đã xác minh là ĐÚNG

| id | Nội dung | Nguồn |
|---|---|---|
| cao-bang-s2 | Làng rèn Phúc Sen là nghề của người Nùng An (Di sản văn hóa phi vật thể quốc gia, QĐ 446 ngày 29/01/2019) | https://tapchicongthuong.vn/magazine/emagazine--dao-phuc-sen--giu-lua-nghe-ren-cua-nguoi-nung-an-547596.htm |
| lai-chau-03 | Sâm Lai Châu = *Panax vietnamensis* var. *fuscidiscus*, tức là một thứ (var.) của loài sâm Ngọc Linh (*P. vietnamensis*) | https://vjs.vjs.ac.vn/js/article/view/469 ; https://sotaichinh.laichau.gov.vn/uploads/news/2024_02/van-ban_1.pdf |
| quang-ngai-s2 | Nhà thờ gỗ Kon Tum xây 1913–1918, làm từ gỗ cà chít, kết hợp kiến trúc Roman với nhà sàn Ba Na | https://hoinongdan.kontum.gov.vn/pages/thu-vien-anh/1009/Nha-tho-go-Kon-Tum.html ; https://tapchicongthuong.vn/den-kon-tum-kham-pha-nha-tho-go-100-tuoi-74514.htm |
| tay-ninh-s2 | Nhà trăm cột (Cần Đước) có 120 cột | https://www.sggp.org.vn/nha-tram-cot-110067.html |
| dong-nai-s1 | Văn Miếu Trấn Biên xây năm 1715, là văn miếu đầu tiên ở Đàng Trong/Nam Bộ (có trước văn miếu Vĩnh Long, Gia Định, Huế) | https://thanhtra.com.vn/van-hoa-the-thao-BE2162E3A/van-mieu-tran-bien-038E76C1.html ; https://vietnamnews.vn/life-style/301602/tran-bien-temple-recognised.html |
| dong-nai-04 | Cát Tiên được công nhận Khu dự trữ sinh quyển thế giới năm 2001; năm 2011 mở rộng và đổi tên thành KDTSQ Đồng Nai | https://en.unesco.org/biosphere/aspac/dong-nai ; https://en.nbca.gov.vn/khu-du-tru-sinh-quyen-dong-nai-khu-dtsq-dong-nai/ |
| dong-nai-s2 | Sóc Bom Bo gắn với người S'tiêng | kiến thức phổ biến; bài hát của Xuân Hồng |
| thai-nguyen-04 | ATK Định Hóa được gọi là "Thủ đô gió ngàn" | https://baophapluat.vn/thu-do-gio-ngan-ngay-ay-bay-gio-post140330.html |
| quang-ninh-04 | Cửa Vạn lọt danh sách 16 ngôi làng cổ đẹp nhất thế giới (Journeyetc, 2012) | https://thanhtra.com.vn/van-hoa-the-thao-BE2162E3A/cua-van-diem-den-cua-nhung-ngoi-lang-noi-tieng-tren-the-gioi-29907280.html |

## 4. Không xác minh được

Không có. Xem lưu ý về phương pháp ở mục 1: các câu kiến thức phổ thông được đối chiếu bằng kiến thức, không có URL riêng cho từng câu.

## 5. provinces.json

### adminCenterAt (23 tỉnh/thành hợp nhất): tất cả ĐÚNG

Đối chiếu với danh sách theo Nghị quyết 60-NQ/TW (12/4/2025), được báo chí đăng lại nguyên văn. Lưu ý: Nghị quyết 202/2025/QH15 chỉ quy định việc sáp nhập và tên gọi, không ghi nơi đặt trung tâm chính trị – hành chính.

| Tỉnh mới | Hợp nhất | adminCenterAt trong file | Theo nguồn | Kết quả |
|---|---|---|---|---|
| Tuyên Quang | Tuyên Quang, Hà Giang | Tuyên Quang | Tuyên Quang | Đúng |
| Lào Cai | Lào Cai, Yên Bái | Yên Bái | Yên Bái | Đúng |
| Thái Nguyên | Thái Nguyên, Bắc Kạn | Thái Nguyên | Thái Nguyên | Đúng |
| Phú Thọ | Phú Thọ, Vĩnh Phúc, Hòa Bình | Phú Thọ | Phú Thọ | Đúng |
| Bắc Ninh | Bắc Ninh, Bắc Giang | Bắc Giang | Bắc Giang | Đúng |
| Hưng Yên | Hưng Yên, Thái Bình | Hưng Yên | Hưng Yên | Đúng |
| Hải Phòng | Hải Phòng, Hải Dương | Hải Phòng | Hải Phòng | Đúng |
| Ninh Bình | Ninh Bình, Hà Nam, Nam Định | Ninh Bình | Ninh Bình | Đúng |
| Quảng Trị | Quảng Trị, Quảng Bình | Quảng Bình | Quảng Bình | Đúng |
| Đà Nẵng | Đà Nẵng, Quảng Nam | Đà Nẵng | Đà Nẵng | Đúng |
| Quảng Ngãi | Quảng Ngãi, Kon Tum | Quảng Ngãi | Quảng Ngãi | Đúng |
| Gia Lai | Gia Lai, Bình Định | Bình Định | Bình Định | Đúng |
| Khánh Hòa | Khánh Hòa, Ninh Thuận | Khánh Hòa | Khánh Hòa | Đúng |
| Lâm Đồng | Lâm Đồng, Đắk Nông, Bình Thuận | Lâm Đồng | Lâm Đồng | Đúng |
| Đắk Lắk | Đắk Lắk, Phú Yên | Đắk Lắk | Đắk Lắk | Đúng |
| TP.HCM | TP.HCM, Bình Dương, BR-VT | TP. Hồ Chí Minh | TP.HCM | Đúng |
| Đồng Nai | Đồng Nai, Bình Phước | Đồng Nai | Đồng Nai | Đúng |
| Tây Ninh | Tây Ninh, Long An | Long An | Long An | Đúng |
| Cần Thơ | Cần Thơ, Sóc Trăng, Hậu Giang | Cần Thơ | Cần Thơ | Đúng |
| Vĩnh Long | Vĩnh Long, Bến Tre, Trà Vinh | Vĩnh Long | Vĩnh Long | Đúng |
| Đồng Tháp | Đồng Tháp, Tiền Giang | Tiền Giang | Tiền Giang | Đúng |
| Cà Mau | Cà Mau, Bạc Liêu | Cà Mau | Cà Mau | Đúng |
| An Giang | An Giang, Kiên Giang | Kiên Giang | Kiên Giang | Đúng |

`mergedFrom` của cả 23 đơn vị cũng khớp với Điều 1 Nghị quyết 202/2025/QH15. 11 đơn vị giữ nguyên (Hà Nội, Huế, Lai Châu, Điện Biên, Sơn La, Lạng Sơn, Quảng Ninh, Thanh Hóa, Nghệ An, Hà Tĩnh, Cao Bằng) cũng khớp.

Nguồn:
- https://baodauthau.vn/du-kien-ten-goi-trung-tam-chinh-tri-hanh-chinh-cua-34-tinh-thanh-thanh-pho-sau-sap-nhap-sap-xep-post177264.html (trích nguyên văn "trung tâm chính trị - hành chính đặt tại…" cho cả 23 đơn vị)
- https://tapchicongthuong.vn/du-kien-cu-the-34-don-vi-hanh-chinh-cap-tinh-sau-sap-nhap--hop-nhat-139371.htm
- https://luatvietnam.vn/hanh-chinh/nghi-quyet-202-2025-qh15-cua-quoc-hoi-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-402728-d1.html (danh sách sáp nhập)

### Bộ sưu tập "unesco" – thành viên `bac-ninh`: ĐÚNG, có thể bỏ cờ `needsReview`

Quần thể di tích và danh thắng **Yên Tử – Vĩnh Nghiêm – Côn Sơn, Kiếp Bạc** được ghi danh Di sản văn hóa thế giới ngày 12/7/2025 tại kỳ họp lần thứ 47 của Ủy ban Di sản thế giới. Đây là di sản thế giới thứ 9 của Việt Nam và là di sản liên tỉnh thứ hai. Quần thể gồm 12 điểm di tích thuộc Quảng Ninh, Bắc Giang cũ (chùa Vĩnh Nghiêm, sườn Tây Yên Tử; nay thuộc Bắc Ninh) và Hải Dương cũ (Côn Sơn, Kiếp Bạc; nay thuộc Hải Phòng). Như vậy `bac-ninh` đủ điều kiện. Di sản này cũng là thêm một căn cứ cho `hai-phong` và `quang-ninh`.

Nguồn: https://vietnamnews.vn/life-style/1721296/yen-tu-vinh-nghiem-con-son-kiep-bac-complex-recognised-as-world-cultural-heritage.html ; https://doingoai.bacgiang.gov.vn/vi/node/885

Danh sách 9 thành viên tương ứng đủ 9 di sản thế giới của Việt Nam:
- ha-noi: Hoàng thành Thăng Long
- hue: Cố đô Huế
- quang-ninh và hai-phong: Hạ Long – Cát Bà; Yên Tử – Côn Sơn, Kiếp Bạc
- ninh-binh: Tràng An
- thanh-hoa: Thành nhà Hồ
- da-nang: Hội An, Mỹ Sơn
- quang-tri: Phong Nha – Kẻ Bàng
- bac-ninh: Vĩnh Nghiêm, Yên Tử

Không thiếu và không thừa tỉnh nào.
