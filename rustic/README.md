# Rustic Romance 모바일 청첩장 시안

실제 모바일 브라우저에서 스크롤하며 비교하는 세 가지 반응형 디자인입니다.

- [01 한 장의 편지](https://manimbigfan.github.io/wedding-invitiation/rustic/?design=letter)
- [02 우리의 한 장면](https://manimbigfan.github.io/wedding-invitiation/rustic/?design=photo)
- [03 여백으로 전하는 마음](https://manimbigfan.github.io/wedding-invitiation/rustic/?design=emboss)

기존 저장소의 이기훈 · 한승미, 2027년 3월 28일 오전 11시 30분, 더채플앳청담 예식 정보와 `assets/our-moment.jpg`를 사용합니다.

## 구성

- `index.html`: 초대글, 예식 정보, 사진, 달력, 길 안내
- `styles.css`: 세 디자인의 레이아웃과 반응형 스타일
- `script.js`: 시안 선택, 사진 확대, 카운트다운, 일정 저장, 복사와 공유

빌드나 별도 서버 없이 GitHub Pages에서 바로 제공합니다. 저장소의 기존 메인 청첩장과 함께 사용할 수 있도록 `/rustic/` 경로에 추가했습니다.

## 수정

이름·문구·장소·사진은 `index.html`에서 바꿉니다. 예식 날짜를 변경할 때는 `script.js`의 날짜 및 일정 정보와 HTML의 표시 날짜·달력도 함께 업데이트해야 합니다. 사진은 기존 `../assets/our-moment.jpg`를 참조합니다.

초대장에는 확인되지 않은 전화번호·계좌·주차 정보나 참석 응답 수집 기능을 추가하지 않았습니다.
