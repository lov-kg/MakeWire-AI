import type { GeneratedCode, WiringConnection } from '../../types'
import {
  baseFilename,
  buildContext,
  detectFeatures,
  makeExplanation,
  makeTitle,
  type BuildContext,
  type CodeDraft,
  type FeatureSet,
  type LocalCodeInput,
} from './shared'
import { uid } from '../utils'

interface SerialRuntime {
  defId: string
  variable: string
  prefix: string
  baud: number
  rxPin: string
  txPin: string
}

class ArduinoBuilder {
  private ctx: BuildContext
  private features: FeatureSet
  private includes = new Set<string>(['<Arduino.h>'])
  private libraries: string[] = []
  private macros: string[] = []
  private macroNames = new Set<string>()
  private globals: string[] = []
  private functions: string[] = []
  private setupLines: string[] = []
  private loopLines: string[] = []
  private notes: string[] = []
  private serials: SerialRuntime[] = []
  private statusLedMacro: string | null = null
  private sensorTask = false

  constructor(ctx: BuildContext, features: FeatureSet) {
    this.ctx = ctx
    this.features = features
  }

  private addInclude(header: string) {
    this.includes.add(header)
  }

  private addLibrary(name: string) {
    this.libraries.push(name)
  }

  private addMacro(name: string, value: string, comment?: string): string {
    if (!this.macroNames.has(name)) {
      this.macroNames.add(name)
      this.macros.push(`#define ${name} ${value}${comment ? `  // ${comment}` : ''}`)
    }
    return name
  }

  private addGlobal(...lines: string[]) {
    this.globals.push(...lines)
  }

  private addFunction(block: string) {
    this.functions.push(block)
  }

  private addSetup(...lines: string[]) {
    this.setupLines.push(...lines)
  }

  private addLoop(...lines: string[]) {
    this.loopLines.push(...lines)
  }

  private pinMacro(name: string, connection: WiringConnection | undefined, fallback = '-1'): string {
    const code = connection?.boardPinCode ?? fallback
    return this.addMacro(name, code, connection ? `${connection.componentPinLabel} → ${connection.boardPinLabel}` : undefined)
  }

  build() {
    this.core()
    this.i2c()
    this.spi()
    this.uart()
    this.actuatorSetup()
    this.sensorSetup()
    this.displaySetup()
    this.storageSetup()
    this.networkFunctions()
    this.networkSetup()
    this.sensorReadFunction()
    this.loopFunction()
    this.setupFunction()

    const libraries = Array.from(new Set(this.libraries)).sort((a, b) => a.localeCompare(b))
    const title = makeTitle(this.ctx.prompt, this.ctx.parts[0]?.def.shortName ?? 'MakerWire')
    const explanation = makeExplanation(this.ctx, this.features, this.notes)
    const code = [
      this.header(title),
      '',
      Array.from(this.includes)
        .map((header) => `#include ${header}`)
        .join('\n'),
      '',
      this.macros.join('\n'),
      '',
      this.globals.join('\n\n'),
      '',
      this.functions.join('\n\n'),
      '',
      this.setupFunctionText(),
      '',
      this.loopFunctionText(),
      '',
      '// ── End MakerWire generated firmware ─────────────────────────────────────',
    ].join('\n')

    return {
      code,
      libraries,
      explanation,
      filename: baseFilename(this.ctx, 'arduino', title),
    }
  }

  private header(title: string): string {
    const boardNotes = this.ctx.board.notes.slice(0, 3).map((note) => ` *   - ${note}`).join('\n')
    return `/*
 * MakerWire AI — generated firmware
 * Project : ${title}
 * Board   : ${this.ctx.board.name} (${this.ctx.board.chip})
 * Logic   : ${this.ctx.board.logicVoltage} V
 * Prompt  : ${this.ctx.prompt.replace(/\n/g, ' ').slice(0, 160)}
 * Wiring  : ${this.ctx.plan.connections.length} connections / ${this.ctx.plan.stats.signals} signals
 *
 * Board reminders:
${boardNotes || ' *   - Verify the pin map before applying power.'}
 *
 * WIFI_SSID and WIFI_PASSWORD are placeholders. Never commit real credentials.
 */`
  }

  private core() {
    this.addSetup(
      `Serial.begin(${this.ctx.board.code.serialBaud});`,
      'delay(250);',
      'Serial.println();',
      'Serial.println("MakerWire AI booting...");',
      `Serial.println("Board: ${this.ctx.board.name}");`,
    )

    if (this.ctx.board.code.ledPinCode && this.ctx.board.id !== 'esp32-s3-devkitc-n16r8') {
      this.statusLedMacro = this.addMacro(
        'STATUS_LED_PIN',
        this.ctx.board.code.ledPinCode,
        'Onboard status LED',
      )
      this.addSetup(`pinMode(${this.statusLedMacro}, OUTPUT);`, `digitalWrite(${this.statusLedMacro}, LOW);`)
    } else {
      this.addMacro('STATUS_LED_PIN', '-1', 'No simple onboard LED on this board')
    }

    this.addMacro('READ_INTERVAL_MS', String(this.features.intervalMs), 'Requested sampling interval')
    this.addGlobal(
      '// ── Shared sensor state ────────────────────────────────────────────────',
      'float sensorTempC = NAN;',
      'float sensorHumidity = NAN;',
      'float sensorPressureHpa = NAN;',
      'float sensorAccelX = 0, sensorAccelY = 0, sensorAccelZ = 0;',
      'long sensorDistanceCm = -1;',
      'int sensorGasRaw = 0;',
      'int sensorPotRaw = 0;',
      'bool sensorButtonDown = false;',
      'unsigned long lastSensorRead = 0;',
    )
  }

  private i2c() {
    if (!this.features.hasI2C) return
    this.addInclude('<Wire.h>')
    const sda = this.ctx.firstI2C('i2c-sda')
    const scl = this.ctx.firstI2C('i2c-scl')
    if (!sda || !scl) return
    this.addMacro('I2C_SDA_PIN', sda.boardPinCode, `SDA → ${sda.boardPinLabel}`)
    this.addMacro('I2C_SCL_PIN', scl.boardPinCode, `SCL → ${scl.boardPinLabel}`)
    if (this.ctx.board.family === 'RP2040' || this.ctx.board.family === 'STM32') {
      this.addSetup(
        'Wire.setSDA(I2C_SDA_PIN);',
        'Wire.setSCL(I2C_SCL_PIN);',
        'Wire.begin();',
      )
    } else if (this.ctx.board.family === 'Espressif') {
      this.addSetup('Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);')
    } else {
      this.addSetup('Wire.begin();')
    }
  }

  private spi() {
    if (!this.features.hasSpi) return
    this.addInclude('<SPI.h>')
    const sck = this.ctx.firstSPI('spi-sck')
    const mosi = this.ctx.firstSPI('spi-mosi')
    const miso = this.ctx.firstSPI('spi-miso')
    if (sck) this.addMacro('SPI_SCK_PIN', sck.boardPinCode, `SCK → ${sck.boardPinLabel}`)
    if (mosi) this.addMacro('SPI_MOSI_PIN', mosi.boardPinCode, `MOSI → ${mosi.boardPinLabel}`)
    if (miso) this.addMacro('SPI_MISO_PIN', miso.boardPinCode, `MISO → ${miso.boardPinLabel}`)
    if (this.ctx.board.family === 'Espressif') {
      this.addSetup(
        `SPI.begin(${sck ? 'SPI_SCK_PIN' : '-1'}, ${miso ? 'SPI_MISO_PIN' : '-1'}, ${mosi ? 'SPI_MOSI_PIN' : '-1'}, -1);`,
      )
    } else if (this.ctx.board.family === 'RP2040' || this.ctx.board.family === 'STM32') {
      if (sck) this.addSetup('SPI.setSCK(SPI_SCK_PIN);')
      if (miso) this.addSetup('SPI.setRX(SPI_MISO_PIN);')
      if (mosi) this.addSetup('SPI.setTX(SPI_MOSI_PIN);')
      this.addSetup('SPI.begin();')
    } else {
      this.addSetup('SPI.begin();')
    }
  }

  private uart() {
    if (!this.features.hasUart) return
    const uartParts = this.ctx.parts.filter(
      (part) => part.def.id === 'neo6m-gps' || part.def.id === 'a7670e-lte',
    )
    let hardwareIndex = 1
    for (const part of uartParts.slice(0, 2)) {
      const prefix = part.def.id === 'neo6m-gps' ? 'GPS' : 'LTE'
      const variable = part.def.id === 'neo6m-gps' ? 'gpsSerial' : 'lteSerial'
      const tx = this.ctx.pin(part.def.id, 'tx')
      const rx = this.ctx.pin(part.def.id, 'rx')
      const rxPin = tx?.boardPinCode ?? '-1'
      const txPin = rx?.boardPinCode ?? '-1'
      this.addMacro(`${prefix}_RX_PIN`, rxPin, tx ? `Module TX → ${tx.boardPinLabel}` : 'Module TX')
      this.addMacro(`${prefix}_TX_PIN`, txPin, rx ? `Module RX → ${rx.boardPinLabel}` : 'Module RX')
      const baud = part.def.id === 'neo6m-gps' ? 9600 : 115200
      this.serials.push({ defId: part.def.id, variable, prefix, baud, rxPin, txPin })

      if (this.ctx.board.family === 'Espressif' && this.ctx.board.id !== 'esp8266-nodemcu') {
        this.addGlobal(`HardwareSerial ${variable}(${hardwareIndex});`)
        this.addSetup(
          `${variable}.begin(${baud}, SERIAL_8N1, ${prefix}_RX_PIN, ${prefix}_TX_PIN);`,
        )
        hardwareIndex += 1
      } else if (this.ctx.board.family === 'RP2040' || this.ctx.board.family === 'STM32') {
        const serialName = hardwareIndex === 1 ? 'Serial1' : 'Serial2'
        this.addGlobal(`#define ${variable} ${serialName}`)
        if (this.ctx.board.family === 'RP2040') {
          this.addSetup(
            `${variable}.setRX(${prefix}_RX_PIN);`,
            `${variable}.setTX(${prefix}_TX_PIN);`,
            `${variable}.begin(${baud});`,
          )
        } else {
          this.addSetup(`${variable}.begin(${baud});`)
        }
        hardwareIndex += 1
      } else {
        this.addInclude('<SoftwareSerial.h>')
        this.addGlobal(`SoftwareSerial ${variable}(${prefix}_RX_PIN, ${prefix}_TX_PIN);`)
        this.addSetup(`${variable}.begin(${baud});`)
      }

      if (part.def.id === 'a7670e-lte') {
        this.notes.push('A7670E: insert the SIM, fit the LTE antenna, set your APN and power the module from a dedicated 5 V / 2 A supply. The scaffold sends conservative AT diagnostics only.')
      }
    }

    if (this.features.hasGps) {
      this.addInclude('<TinyGPSPlus.h>')
      this.addLibrary('TinyGPSPlus')
      this.addGlobal('TinyGPSPlus gps;')
      this.addFunction(`void feedGps() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
}`)
      this.addLoop('feedGps();')
    }

    if (this.features.hasLte) {
      this.addFunction(`void sendAtCommand(const String &command) {
  lteSerial.println(command);
  delay(400);
  while (lteSerial.available() > 0) {
    Serial.write(lteSerial.read());
  }
}`)
      this.addSetup(
        'delay(1200);',
        'sendAtCommand("AT");',
        'sendAtCommand("AT+CPIN?");',
        'sendAtCommand("AT+CSQ");',
      )
    }
  }

  private actuatorSetup() {
    if (this.features.hasRelay) {
      const relay = this.ctx.pin('relay-1ch', 'in')
      this.pinMacro('RELAY_IN_PIN', relay)
      this.addGlobal('bool relayState = false;', 'const bool RELAY_ACTIVE_LOW = true;')
      this.addSetup('pinMode(RELAY_IN_PIN, OUTPUT);', 'digitalWrite(RELAY_IN_PIN, HIGH);')
      this.addFunction(`void setRelay(bool on) {
  relayState = on;
  digitalWrite(RELAY_IN_PIN, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
  Serial.print("Relay: ");
  Serial.println(on ? "ON" : "OFF");
}`)
    }

    if (this.features.hasServo) {
      const servo = this.ctx.pin('sg90-servo', 'pwm')
      this.pinMacro('SERVO_PWM_PIN', servo)
      if (this.ctx.board.family === 'Espressif' && this.ctx.board.id !== 'esp8266-nodemcu') {
        this.addInclude('<ESP32Servo.h>')
        this.addLibrary('ESP32Servo')
      } else {
        this.addInclude('<Servo.h>')
        this.addLibrary('Servo')
      }
      this.addGlobal('Servo sweepServo;', 'int servoAngle = 0;', 'int servoDirection = 1;', 'unsigned long lastServoUpdate = 0;')
      this.addSetup('sweepServo.attach(SERVO_PWM_PIN);', 'sweepServo.write(0);')
      this.addLoop(`if (millis() - lastServoUpdate >= 40) {
  lastServoUpdate = millis();
  servoAngle += servoDirection * 5;
  if (servoAngle >= 180 || servoAngle <= 0) {
    servoDirection *= -1;
  }
  sweepServo.write(servoAngle);
}`)
    }

    if (this.features.hasStepper) {
      this.pinMacro('STEPPER_STEP_PIN', this.ctx.pin('a4988-stepper', 'step'))
      this.pinMacro('STEPPER_DIR_PIN', this.ctx.pin('a4988-stepper', 'dir'))
      this.pinMacro('STEPPER_EN_PIN', this.ctx.pin('a4988-stepper', 'en'))
      this.addGlobal('unsigned long lastStepAt = 0;')
      this.addSetup(
        'pinMode(STEPPER_STEP_PIN, OUTPUT);',
        'pinMode(STEPPER_DIR_PIN, OUTPUT);',
        'pinMode(STEPPER_EN_PIN, OUTPUT);',
        'digitalWrite(STEPPER_DIR_PIN, HIGH);',
        'digitalWrite(STEPPER_EN_PIN, LOW);',
      )
      this.addLoop(`if (millis() - lastStepAt >= 2) {
  lastStepAt = millis();
  digitalWrite(STEPPER_STEP_PIN, HIGH);
  delayMicroseconds(4);
  digitalWrite(STEPPER_STEP_PIN, LOW);
}`)
      this.notes.push('A4988: set the current limit before connecting the motor. VMOT must come from a separate motor supply with a 100 µF capacitor across VMOT/GND.')
    }

    if (this.features.hasNeopixel) {
      this.pinMacro('NEOPIXEL_DIN_PIN', this.ctx.pin('ws2812b-strip', 'din'))
      this.addInclude('<Adafruit_NeoPixel.h>')
      this.addLibrary('Adafruit NeoPixel')
      this.addGlobal(
        'const int NEOPIXEL_COUNT = 30;',
        'Adafruit_NeoPixel pixels(NEOPIXEL_COUNT, NEOPIXEL_DIN_PIN, NEO_GRB + NEO_KHZ800);',
        'unsigned long lastPixelUpdate = 0;',
        'uint8_t pixelPhase = 0;',
      )
      this.addSetup('pixels.begin();', 'pixels.clear();', 'pixels.show();')
      this.addLoop(`if (millis() - lastPixelUpdate >= 60) {
  lastPixelUpdate = millis();
  for (int i = 0; i < NEOPIXEL_COUNT; i++) {
    uint8_t brightness = (i * 8 + pixelPhase) % 255;
    pixels.setPixelColor(i, pixels.Color(brightness, 255 - brightness, brightness / 2));
  }
  pixels.show();
  pixelPhase += 4;
}`)
      this.notes.push('WS2812B: power the strip from a separate 5 V supply and tie grounds together. Use a 330–470 Ω series resistor on DIN.')
    }

    if (this.features.hasLed) {
      this.pinMacro('USER_LED_PIN', this.ctx.pin('led-5mm', 'a'))
      this.addSetup('pinMode(USER_LED_PIN, OUTPUT);', 'digitalWrite(USER_LED_PIN, LOW);')
      this.addGlobal('bool userLedState = false;')
    }

    if (this.features.hasBuzzer) {
      this.pinMacro('BUZZER_SIG_PIN', this.ctx.pin('active-buzzer', 'sig'))
      this.addSetup('pinMode(BUZZER_SIG_PIN, OUTPUT);', 'digitalWrite(BUZZER_SIG_PIN, HIGH);', 'delay(80);', 'digitalWrite(BUZZER_SIG_PIN, LOW);')
    }
  }

  private sensorSetup() {
    if (this.features.hasDht) {
      this.pinMacro('DHT22_DATA_PIN', this.ctx.pin('dht22', 'data'))
      this.addInclude('<DHT.h>')
      this.addLibrary('DHT sensor library (Adafruit)')
      this.addLibrary('Adafruit Unified Sensor')
      this.addGlobal('#define DHT22_TYPE DHT22', 'DHT dht(DHT22_DATA_PIN, DHT22_TYPE);')
      this.addSetup('dht.begin();')
      this.sensorTask = true
    }

    if (this.features.hasBme) {
      this.addInclude('<Adafruit_BME280.h>')
      this.addInclude('<Adafruit_Sensor.h>')
      this.addLibrary('Adafruit BME280 Library')
      this.addLibrary('Adafruit Unified Sensor')
      this.addGlobal('Adafruit_BME280 bme;')
      this.addSetup('if (!bme.begin(0x76, &Wire)) {', '  Serial.println("BME280 not found at 0x76");', '}')
      this.sensorTask = true
    }

    if (this.features.hasMpu) {
      this.addInclude('<Adafruit_MPU6050.h>')
      this.addInclude('<Adafruit_Sensor.h>')
      this.addLibrary('Adafruit MPU6050')
      this.addLibrary('Adafruit Unified Sensor')
      this.addGlobal('Adafruit_MPU6050 mpu;')
      this.addSetup('if (!mpu.begin()) {', '  Serial.println("MPU6050 not found");', '}', 'mpu.setAccelerometerRange(MPU6050_RANGE_8_G);', 'mpu.setGyroRange(MPU6050_RANGE_500_DEG);')
      this.sensorTask = true
    }

    if (this.features.hasUltrasonic) {
      this.pinMacro('HCSR04_TRIG_PIN', this.ctx.pin('hc-sr04', 'trig'))
      this.pinMacro('HCSR04_ECHO_PIN', this.ctx.pin('hc-sr04', 'echo'))
      this.addSetup('pinMode(HCSR04_TRIG_PIN, OUTPUT);', 'pinMode(HCSR04_ECHO_PIN, INPUT);', 'digitalWrite(HCSR04_TRIG_PIN, LOW);')
      this.addFunction(`long measureDistanceCm() {
  digitalWrite(HCSR04_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(HCSR04_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(HCSR04_TRIG_PIN, LOW);
  unsigned long duration = pulseIn(HCSR04_ECHO_PIN, HIGH, 30000UL);
  if (duration == 0) return -1;
  return (long)(duration * 0.0343f / 2.0f);
}`)
      this.sensorTask = true
      this.notes.push('HC-SR04: ECHO is a 5 V output. The generated code assumes the wiring guide added a divider/level shifter on 3.3 V boards.')
    }

    if (this.features.hasGas) {
      this.pinMacro('MQ2_AO_PIN', this.ctx.pin('mq2', 'ao'))
      this.addSetup('pinMode(MQ2_AO_PIN, INPUT);')
      const doPin = this.ctx.pin('mq2', 'do')
      if (doPin) this.pinMacro('MQ2_DO_PIN', doPin)
      this.sensorTask = true
      this.notes.push('MQ-2: allow a warm-up period and calibrate the sensor. Its analog output can reach 5 V — use a divider on 3.3 V ADCs.')
    }

    if (this.features.hasPot) {
      this.pinMacro('POT_WIPER_PIN', this.ctx.pin('potentiometer', 'wiper'))
      this.addSetup('pinMode(POT_WIPER_PIN, INPUT);')
      this.sensorTask = true
    }

    if (this.features.hasButton) {
      this.pinMacro('BUTTON_SIGNAL_PIN', this.ctx.pin('pushbutton', 'sig'))
      this.addSetup('pinMode(BUTTON_SIGNAL_PIN, INPUT_PULLUP);')
      this.addGlobal('bool lastButtonReading = HIGH;', 'unsigned long lastButtonChange = 0;')
      this.addLoop(`bool buttonReading = digitalRead(BUTTON_SIGNAL_PIN);
if (buttonReading != lastButtonReading && millis() - lastButtonChange > 35) {
  lastButtonChange = millis();
  lastButtonReading = buttonReading;
  sensorButtonDown = (buttonReading == LOW);
  Serial.print("Button: ");
  Serial.println(sensorButtonDown ? "PRESSED" : "released");
${this.features.hasRelay ? `  if (sensorButtonDown) {
    setRelay(!relayState);
  }
` : ''}}`)
    }

    if (this.features.hasRtc) {
      this.addInclude('<RTClib.h>')
      this.addLibrary('RTClib (Adafruit)')
      this.addGlobal('RTC_DS3231 rtc;')
      this.addSetup('if (!rtc.begin()) {', '  Serial.println("DS3231 not found");', '}')
      this.sensorTask = true
    }

    if (this.features.hasGps) {
      this.sensorTask = true
    }

    if (this.features.hasGas || this.features.hasPot) {
      if (this.ctx.board.family === 'Espressif') {
        this.addSetup(`analogReadResolution(${this.ctx.board.code.adcBits});`)
      }
    }
  }

  private displaySetup() {
    if (this.features.hasOled) {
      this.addInclude('<Adafruit_GFX.h>')
      this.addInclude('<Adafruit_SSD1306.h>')
      this.addLibrary('Adafruit SSD1306')
      this.addLibrary('Adafruit GFX Library')
      this.addGlobal(
        '#define OLED_WIDTH 128',
        '#define OLED_HEIGHT 64',
        'Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);',
      )
      this.addSetup(
        'if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {',
        '  Serial.println("SSD1306 not found at 0x3C");',
        '}',
        'oled.clearDisplay();',
        'oled.setTextColor(SSD1306_WHITE);',
        'oled.setTextSize(1);',
        'oled.setCursor(0, 0);',
        'oled.println("MakerWire AI");',
        'oled.println("Booting...");',
        'oled.display();',
      )
    }

    if (this.features.hasTft) {
      this.addInclude('<Adafruit_ILI9341.h>')
      this.addLibrary('Adafruit ILI9341')
      this.addLibrary('Adafruit GFX Library')
      const cs = this.ctx.pin('ili9341-tft', 'cs')
      const dc = this.ctx.pin('ili9341-tft', 'dc')
      const rst = this.ctx.pin('ili9341-tft', 'rst')
      this.pinMacro('TFT_CS_PIN', cs)
      this.pinMacro('TFT_DC_PIN', dc)
      this.pinMacro('TFT_RST_PIN', rst)
      this.addGlobal('Adafruit_ILI9341 tft(TFT_CS_PIN, TFT_DC_PIN, TFT_RST_PIN);')
      this.addSetup(
        'tft.begin();',
        'tft.setRotation(1);',
        'tft.fillScreen(ILI9341_BLACK);',
        'tft.setTextColor(ILI9341_GREEN);',
        'tft.setTextSize(2);',
        'tft.setCursor(12, 18);',
        'tft.println("MakerWire AI");',
        'tft.setTextSize(1);',
        'tft.setCursor(12, 50);',
        'tft.println("Initialising...");',
      )
    }

    if (this.features.hasOled || this.features.hasTft) {
      this.addFunction(this.displayFunction())
    }
  }

  private displayFunction(): string {
    const lines: string[] = ['void updateDisplays() {']
    if (this.features.hasOled) {
      lines.push(
        '  oled.clearDisplay();',
        '  oled.setTextSize(1);',
        '  oled.setTextColor(SSD1306_WHITE);',
        '  oled.setCursor(0, 0);',
        '  oled.println("MakerWire AI");',
      )
      if (this.features.hasDht || this.features.hasBme) {
        lines.push(
          '  oled.print("Temp: ");',
          '  if (isnan(sensorTempC)) oled.println("--"); else { oled.print(sensorTempC, 1); oled.println(" C"); }',
          '  oled.print("Hum:  ");',
          '  if (isnan(sensorHumidity)) oled.println("--"); else { oled.print(sensorHumidity, 1); oled.println(" %"); }',
        )
      }
      if (this.features.hasGps) {
        lines.push(
          '  oled.print("Sats: ");',
          '  oled.println(gps.satellites.value());',
          '  oled.print("Fix:  ");',
          '  oled.println(gps.location.isValid() ? "locked" : "waiting");',
        )
      }
      if (this.features.hasUltrasonic) {
        lines.push(
          '  oled.print("Dist: ");',
          '  if (sensorDistanceCm < 0) oled.println("--"); else { oled.print(sensorDistanceCm); oled.println(" cm"); }',
        )
      }
      if (this.features.hasGas) {
        lines.push('  oled.print("Gas:  ");', '  oled.println(sensorGasRaw);')
      }
      if (this.features.hasPot) {
        lines.push('  oled.print("ADC:  ");', '  oled.println(sensorPotRaw);')
      }
      if (this.features.wantsWifi && this.ctx.boardWifi) {
        lines.push(
          '  oled.println();',
          '  if (WiFi.status() == WL_CONNECTED) { oled.print("IP: "); oled.println(WiFi.localIP()); }',
          '  else oled.println("Wi-Fi offline");',
        )
      }
      lines.push('  oled.display();')
    }
    if (this.features.hasTft) {
      lines.push(
        '  tft.fillScreen(ILI9341_BLACK);',
        '  tft.setTextSize(2);',
        '  tft.setTextColor(ILI9341_GREEN);',
        '  tft.setCursor(12, 14);',
        '  tft.println("MakerWire AI");',
        '  tft.setTextSize(1);',
        '  tft.setTextColor(ILI9341_WHITE);',
      )
      if (this.features.hasDht || this.features.hasBme) {
        lines.push(
          '  tft.setCursor(12, 52);',
          '  if (isnan(sensorTempC)) tft.println("Temperature: --"); else { tft.print("Temperature: "); tft.print(sensorTempC, 1); tft.println(" C"); }',
          '  tft.setCursor(12, 70);',
          '  if (isnan(sensorHumidity)) tft.println("Humidity: --"); else { tft.print("Humidity: "); tft.print(sensorHumidity, 1); tft.println(" %"); }',
        )
      }
      if (this.features.hasGps) {
        lines.push(
          '  tft.setCursor(12, 52);',
          '  tft.print("Satellites: "); tft.println(gps.satellites.value());',
          '  tft.setCursor(12, 70);',
          '  tft.print("GPS fix: "); tft.println(gps.location.isValid() ? "locked" : "waiting");',
        )
      }
      if (this.features.hasUltrasonic) {
        lines.push('  tft.setCursor(12, 88);', '  tft.print("Distance: "); if (sensorDistanceCm < 0) tft.println("--"); else { tft.print(sensorDistanceCm); tft.println(" cm"); }')
      }
      if (this.features.wantsWifi && this.ctx.boardWifi) {
        lines.push(
          '  tft.setCursor(12, 118);',
          '  if (WiFi.status() == WL_CONNECTED) { tft.print("IP: "); tft.println(WiFi.localIP()); }',
          '  else tft.println("Wi-Fi offline");',
        )
      }
    }
    lines.push('}')
    return lines.join('\n')
  }

  private storageSetup() {
    if (!this.features.hasSd) return
    this.pinMacro('SD_CS_PIN', this.ctx.pin('microsd-spi', 'cs'))
    this.addInclude('<SD.h>')
    this.addLibrary('SD (built-in)')
    this.addGlobal('bool sdReady = false;')
    this.addSetup(
      `if (!SD.begin(SD_CS_PIN, SPI)) {`,
      '  Serial.println("microSD init failed");',
      '  sdReady = false;',
      '} else {',
      '  sdReady = true;',
      '  Serial.println("microSD ready");',
      '}',
    )
    this.addFunction(`void logToSd() {
  if (!sdReady) return;
  File file = SD.open("/makerwire.csv", FILE_WRITE);
  if (!file) {
    Serial.println("CSV open failed");
    return;
  }
  if (file.size() == 0) {
    file.println("millis,temp_c,humidity_pct,pressure_hpa,distance_cm,gas_raw,pot_raw");
  }
  file.print(millis());
  file.print(',');
  if (isnan(sensorTempC)) file.print(""); else file.print(sensorTempC, 2);
  file.print(',');
  if (isnan(sensorHumidity)) file.print(""); else file.print(sensorHumidity, 2);
  file.print(',');
  if (isnan(sensorPressureHpa)) file.print(""); else file.print(sensorPressureHpa, 2);
  file.print(',');
  file.print(sensorDistanceCm);
  file.print(',');
  file.print(sensorGasRaw);
  file.print(',');
  file.println(sensorPotRaw);
  file.close();
}`)
  }

  private networkSetup() {
    const useWifi = this.features.canUseWifi && (this.features.wantsWifi || this.features.wantsWeb)
    if (!useWifi) {
      if (this.features.webWithoutWifi) {
        this.notes.push('The requested web server cannot run on this board. The generated sketch exposes serial commands instead.')
        if (this.features.hasRelay) {
          this.addFunction(`void handleSerialCommand() {
  if (!Serial.available()) return;
  String command = Serial.readStringUntil('\\n');
  command.trim();
  command.toLowerCase();
  if (command == "on" || command == "relay on") setRelay(true);
  if (command == "off" || command == "relay off") setRelay(false);
  if (command == "status") {
    Serial.print("Relay: ");
    Serial.println(relayState ? "ON" : "OFF");
  }
}`)
          this.addLoop('handleSerialCommand();')
        }
      }
      return
    }

    const esp8266 = this.ctx.board.id === 'esp8266-nodemcu'
    this.addInclude(this.ctx.board.code.wifiHeader ?? '<WiFi.h>')
    if (this.features.wantsWeb) {
      if (esp8266) {
        this.addInclude('<ESP8266WebServer.h>')
        this.addGlobal('ESP8266WebServer server(80);')
      } else {
        this.addInclude('<WebServer.h>')
        this.addGlobal('WebServer server(80);')
      }
    }
    this.addGlobal(
      'const char *WIFI_SSID = "YOUR_WIFI_SSID";',
      'const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";',
    )
    this.addFunction(`void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 15000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi connection failed. Check credentials and signal.");
  }
}`)
    this.addSetup('connectWiFi();')
    if (!this.features.wantsWeb) return

    const handlers: string[] = [
      `void handleRoot() {
  server.send(200, "text/html", buildPage());
}`,
    ]
    if (this.features.hasRelay) {
      handlers.push(
        `void handleRelayOn() {
  setRelay(true);
  server.sendHeader("Location", "/");
  server.send(303, "text/plain", "Relay ON");
}`,
        `void handleRelayOff() {
  setRelay(false);
  server.sendHeader("Location", "/");
  server.send(303, "text/plain", "Relay OFF");
}`,
      )
    }
    handlers.push(`void handleStatus() {
  String json = "{\\"ip\\":\\"";
  json += WiFi.localIP().toString();
  json += "\\"";
${this.features.hasRelay ? '  json += ",\\"relay\\":";\n  json += relayState ? "true" : "false";\n' : ''}  json += ",\\"temperature_c\\":";
  json += isnan(sensorTempC) ? "null" : String(sensorTempC, 2);
  json += "}";
  server.send(200, "application/json", json);
}`)
    this.addFunction(handlers.join('\n\n'))
    this.addSetup('server.on("/", handleRoot);')
    if (this.features.hasRelay) {
      this.addSetup(
        'server.on("/relay/on", handleRelayOn);',
        'server.on("/relay/off", handleRelayOff);',
      )
    }
    this.addSetup('server.on("/status", handleStatus);', 'server.begin();', 'Serial.println("HTTP server started on port 80");')
    this.addLoop('server.handleClient();')
    this.notes.push('Web server: connect your phone or laptop to the same network and open the IP printed on the serial monitor. Credentials are placeholders.')
  }

  private networkFunctions() {
    if (!this.features.wantsWeb || !this.features.canUseWifi) return
    const page: string[] = [
      'String buildPage() {',
      '  String html = "<!doctype html><html><head><meta charset=\\"utf-8\\"><meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1\\">";',
      '  html += "<title>MakerWire Node</title><style>body{font-family:system-ui,sans-serif;background:#071017;color:#e2e8f0;margin:0;padding:32px}main{max-width:640px;margin:auto}h1{color:#54e6b1}section{background:#0d1821;border:1px solid #203444;border-radius:16px;padding:20px;margin:16px 0}a{display:inline-block;background:#13ac7b;color:#04110b;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;margin-right:8px}strong{color:#8cf8cf}</style></head><body><main>";',
      `  html += "<h1>${this.ctx.board.shortName.replace(/[^a-zA-Z0-9 .-]/g, '')}</h1><p>MakerWire AI controller</p>";`,
    ]
    if (this.features.hasSensor) {
      page.push(
        '  html += "<section><h2>Live readings</h2>";',
        '  if (!isnan(sensorTempC)) { html += "<p>Temperature: <strong>" + String(sensorTempC, 1) + " &deg;C</strong></p>"; }',
        '  if (!isnan(sensorHumidity)) { html += "<p>Humidity: <strong>" + String(sensorHumidity, 1) + " %</strong></p>"; }',
        '  if (!isnan(sensorPressureHpa)) { html += "<p>Pressure: <strong>" + String(sensorPressureHpa, 1) + " hPa</strong></p>"; }',
      )
      if (this.features.hasUltrasonic) {
        page.push('  if (sensorDistanceCm >= 0) { html += "<p>Distance: <strong>" + String(sensorDistanceCm) + " cm</strong></p>"; }')
      }
      if (this.features.hasGas) {
        page.push('  html += "<p>Gas raw: <strong>" + String(sensorGasRaw) + "</strong></p>";')
      }
      if (this.features.hasPot) {
        page.push('  html += "<p>ADC raw: <strong>" + String(sensorPotRaw) + "</strong></p>";')
      }
      page.push('  html += "</section>";')
    }
    if (this.features.hasRelay) {
      page.push(
        '  html += "<section><h2>Relay</h2><p>State: <strong>";',
        '  html += relayState ? "ON" : "OFF";',
        '  html += "</strong></p><p><a href=\\"/relay/on\\">Turn ON</a><a href=\\"/relay/off\\">Turn OFF</a></p></section>";',
      )
    }
    page.push(
      '  html += "<p>IP: <strong>" + WiFi.localIP().toString() + "</strong></p></main></body></html>";',
      '  return html;',
      '}',
    )
    this.addFunction(page.join('\n'))
  }

  private sensorReadFunction() {
    const hasWork =
      this.sensorTask ||
      this.features.hasDisplay ||
      this.features.hasSd ||
      this.features.hasLte ||
      this.features.hasLed
    if (!hasWork) return

    const lines: string[] = ['void readSensors() {']
    if (this.features.hasDht) {
      lines.push(
        '  float dhtTemp = dht.readTemperature();',
        '  float dhtHumidity = dht.readHumidity();',
        '  if (!isnan(dhtTemp) && !isnan(dhtHumidity)) {',
        '    sensorTempC = dhtTemp;',
        '    sensorHumidity = dhtHumidity;',
        '    Serial.print("DHT22: ");',
        '    Serial.print(sensorTempC, 1);',
        '    Serial.print(" C / ");',
        '    Serial.print(sensorHumidity, 1);',
        '    Serial.println(" %");',
        '  } else {',
        '    Serial.println("DHT22 read failed");',
        '  }',
      )
    }
    if (this.features.hasBme) {
      lines.push(
        '  sensorTempC = bme.readTemperature();',
        '  sensorHumidity = bme.readHumidity();',
        '  sensorPressureHpa = bme.readPressure() / 100.0F;',
        '  Serial.print("BME280: ");',
        '  Serial.print(sensorTempC, 1);',
        '  Serial.print(" C / ");',
        '  Serial.print(sensorHumidity, 1);',
        '  Serial.print(" % / ");',
        '  Serial.print(sensorPressureHpa, 1);',
        '  Serial.println(" hPa");',
      )
    }
    if (this.features.hasMpu) {
      lines.push(
        '  sensors_event_t accel, gyro, temp;',
        '  mpu.getEvent(&accel, &gyro, &temp);',
        '  sensorAccelX = accel.acceleration.x;',
        '  sensorAccelY = accel.acceleration.y;',
        '  sensorAccelZ = accel.acceleration.z;',
        '  Serial.print("MPU6050 accel: ");',
        '  Serial.print(sensorAccelX, 2); Serial.print(", ");',
        '  Serial.print(sensorAccelY, 2); Serial.print(", ");',
        '  Serial.println(sensorAccelZ, 2);',
      )
    }
    if (this.features.hasUltrasonic) {
      lines.push(
        '  sensorDistanceCm = measureDistanceCm();',
        '  Serial.print("Distance: ");',
        '  Serial.print(sensorDistanceCm);',
        '  Serial.println(" cm");',
      )
    }
    if (this.features.hasGas) {
      lines.push(
        '  sensorGasRaw = analogRead(MQ2_AO_PIN);',
        '  Serial.print("MQ-2 raw: ");',
        '  Serial.println(sensorGasRaw);',
      )
    }
    if (this.features.hasPot) {
      lines.push(
        '  sensorPotRaw = analogRead(POT_WIPER_PIN);',
        '  Serial.print("Potentiometer: ");',
        '  Serial.println(sensorPotRaw);',
      )
    }
    if (this.features.hasRtc) {
      lines.push(
        '  DateTime now = rtc.now();',
        '  Serial.print("RTC: ");',
        '  Serial.print(now.year()); Serial.print("-");',
        '  Serial.print(now.month()); Serial.print("-");',
        '  Serial.print(now.day()); Serial.print(" ");',
        '  Serial.print(now.hour()); Serial.print(":");',
        '  Serial.print(now.minute()); Serial.print(":");',
        '  Serial.println(now.second());',
      )
    }
    if (this.features.hasGps) {
      lines.push(
        '  if (gps.location.isValid()) {',
        '    Serial.print("GPS: ");',
        '    Serial.print(gps.location.lat(), 6);',
        '    Serial.print(", ");',
        '    Serial.println(gps.location.lng(), 6);',
        '  } else {',
        '    Serial.println("GPS: waiting for fix");',
        '  }',
      )
    }
    if (this.features.hasLte) {
      lines.push('  sendAtCommand("AT+CSQ");')
    }
    if (this.features.hasLed) {
      lines.push(
        '  userLedState = !userLedState;',
        '  digitalWrite(USER_LED_PIN, userLedState ? HIGH : LOW);',
      )
    }
    if (this.features.hasDisplay) {
      lines.push('  updateDisplays();')
    }
    if (this.features.hasSd) {
      lines.push('  logToSd();')
    }
    if (this.features.wantsWifi && this.ctx.boardWifi) {
      lines.push(
        '  if (WiFi.status() != WL_CONNECTED) {',
        '    Serial.println("Wi-Fi disconnected");',
        '  }',
      )
    }
    lines.push('}')
    this.addFunction(lines.join('\n'))
  }

  private loopFunction() {
    const hasRead = this.sensorTask || this.features.hasDisplay || this.features.hasSd || this.features.hasLte || this.features.hasLed
    if (hasRead) {
      this.addLoop(`if (millis() - lastSensorRead >= READ_INTERVAL_MS) {
  lastSensorRead = millis();
  readSensors();
}`)
    } else {
      this.addLoop(`static unsigned long lastHeartbeat = 0;
if (millis() - lastHeartbeat >= 2000) {
  lastHeartbeat = millis();
  Serial.println("MakerWire controller alive");
}`)
    }
  }

  private setupFunction() {
    const lines = [...this.setupLines]
    lines.push('Serial.println("Ready. Open the serial monitor for readings.");')
    if (this.sensorTask) {
      lines.push('readSensors();')
    } else if (this.features.hasDisplay) {
      lines.push('updateDisplays();')
    }
    lines.push('lastSensorRead = millis();')
    this.setupLines = lines
  }

  private setupFunctionText(): string {
    return `void setup() {
${this.setupLines.map((line) => `  ${line}`).join('\n')}
}`
  }

  private loopFunctionText(): string {
    return `void loop() {
${this.loopLines.map((line) => `  ${line}`).join('\n')}
}`
  }
}

export function generateArduinoCode(input: LocalCodeInput): CodeDraft {
  const ctx = buildContext(input)
  const features = detectFeatures(ctx)
  return new ArduinoBuilder(ctx, features).build()
}

export const arduinoGeneratedAt = (): string => new Date().toISOString()

export const makeArduinoResult = (
  input: LocalCodeInput,
  generated: CodeDraft,
): GeneratedCode => ({
  id: uid('code'),
  title: makeTitle(input.prompt, 'MakerWire'),
  prompt: input.prompt,
  framework: 'arduino',
  source: 'local',
  code: generated.code,
  filename: generated.filename,
  explanation: generated.explanation,
  libraries: generated.libraries,
  createdAt: new Date().toISOString(),
})
