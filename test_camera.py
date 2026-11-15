import cv2

print("Searching for cameras...")
working = []

for index in range(5):
    cap = cv2.VideoCapture(index)
    if cap.isOpened() and cap.read()[0]:
        print(f"✓ Camera found at index {index}")
        working.append(index)
    cap.release()

if not working:
    print("✗ No cameras detected. Check drivers or whether another app is using the camera.")
    raise SystemExit(1)

print(f"\nWorking cameras: {working}")

cap = cv2.VideoCapture(working[0])
print("Showing a 3 second preview...")
ok, frame = cap.read()
if ok:
    cv2.imshow('Camera Test', frame)
    cv2.waitKey(3000)
else:
    print("✗ Can't read from camera")
cap.release()
cv2.destroyAllWindows()
