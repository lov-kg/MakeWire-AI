import {
  baseFilename,
  buildContext,
  detectFeatures,
  makeExplanation,
  makeTitle,
  type CodeDraft,
  type LocalCodeInput,
} from './shared'
import type { WiringConnection } from '../../types'

const pyPin = (connection: WiringConnection | undefined): string => {
  const code = connection?.boardPinCode
  if (!code) return '-1'
  if (/^\d+$/.test(code)) return code
  if (/^P[A-Z]\d+$/.test(code)) return `'${code.slice(1)}'`
  if (code === 'LED_BUILTIN') return `'LED'`
  return `'${code}'`
}

export function generateMicroPythonCode(input: LocalCodeInput): CodeDraft {
  const ctx = buildContext(input)
  const f = detectFeatures(ctx)
  const lines: string[] = []
  const imports = new Set<string>(['import time', 'from machine import Pin'])
  const libraries: string[] = []
  const notes: string[] = []
  const setup: string[] = []
  const sensors: string[] = []
  const readLines: string[] = []
  const updateLines: string[] = []
  const loopLines: string[] = []
  const globals: string[] = []
  const assignedGlobals = new Set<string>()
  const useWifi = ctx.boardWifi && (f.wantsWifi || f.wantsWeb)

  const addImport = (value: string) => imports.add(value)

  // ── I2C bus ──────────────────────────────────────────────────────────────
  let i2cVar: string | null = null
  if (f.hasI2C) {
    const sda = ctx.firstI2C('i2c-sda')
    const scl = ctx.firstI2C('i2c-scl')
    if (sda && scl) {
      if (ctx.board.id === 'esp8266-nodemcu') {
        addImport('from machine import SoftI2C')
        setup.push(
          `i2c = SoftI2C(scl=Pin(${pyPin(scl)}), sda=Pin(${pyPin(sda)}), freq=400000)`,
        )
      } else if (ctx.board.family === 'RP2040') {
        addImport('from machine import I2C')
        setup.push(
          `i2c = I2C(0, scl=Pin(${pyPin(scl)}), sda=Pin(${pyPin(sda)}), freq=400000)`,
        )
      } else if (ctx.board.family === 'STM32') {
        addImport('from machine import I2C')
        setup.push(
          `i2c = I2C(1, scl=Pin(${pyPin(scl)}), sda=Pin(${pyPin(sda)}), freq=400000)`,
        )
      } else {
        addImport('from machine import I2C')
        setup.push(
          `i2c = I2C(0, scl=Pin(${pyPin(scl)}), sda=Pin(${pyPin(sda)}), freq=400000)`,
        )
      }
      i2cVar = 'i2c'
    }
  }

  // ── Sensor state ─────────────────────────────────────────────────────────
  if (f.hasSensor || f.hasDisplay) {
    globals.push(
      'temperature = None',
      'humidity = None',
      'pressure = None',
      'distance_cm = None',
      'gas_raw = None',
      'pot_raw = None',
      'button_down = False',
    )
  }

  if (f.hasDht) {
    addImport('import dht')
    const data = ctx.pin('dht22', 'data')
    setup.push(
      `dht_sensor = dht.DHT22(Pin(${pyPin(data)}))`,
    )
    readLines.push(
      '    try:',
      '        dht_sensor.measure()',
      '        temperature = dht_sensor.temperature()',
      '        humidity = dht_sensor.humidity()',
      '        print("DHT22:", temperature, "C /", humidity, "%")',
      '    except Exception as exc:',
      '        print("DHT22 read failed:", exc)',
    )
    assignedGlobals.add('temperature')
    assignedGlobals.add('humidity')
    libraries.push('dht (MicroPython built-in)')
  }

  if (f.hasBme) {
    addImport('from bme280 import BME280')
    if (i2cVar) {
      setup.push(`bme = BME280(i2c=${i2cVar})`)
    }
    readLines.push(
      '    try:',
      '        temperature = float(bme.temperature)',
      '        humidity = float(bme.humidity)',
      '        pressure = float(bme.pressure)',
      '        print("BME280:", temperature, "C /", humidity, "% /", pressure, "hPa")',
      '    except Exception as exc:',
      '        print("BME280 read failed:", exc)',
    )
    assignedGlobals.add('temperature')
    assignedGlobals.add('humidity')
    assignedGlobals.add('pressure')
    libraries.push('bme280.py driver (community)')
  }

  if (f.hasUltrasonic) {
    addImport('import machine')
    const trig = ctx.pin('hc-sr04', 'trig')
    const echo = ctx.pin('hc-sr04', 'echo')
    setup.push(
      `trig = Pin(${pyPin(trig)}, Pin.OUT)`,
      `echo = Pin(${pyPin(echo)}, Pin.IN)`,
      'trig.value(0)',
    )
    readLines.push(
      '    trig.value(1)',
      '    time.sleep_us(10)',
      '    trig.value(0)',
      `    pulse = machine.time_pulse_us(echo, 1, 30000)`,
      '    distance_cm = round(pulse * 0.0343 / 2, 1) if pulse > 0 else None',
      '    print("Distance:", distance_cm, "cm")',
    )
    assignedGlobals.add('distance_cm')
  }

  if (f.hasGas) {
    addImport('from machine import ADC')
    const ao = ctx.pin('mq2', 'ao')
    if (ctx.board.id === 'esp8266-nodemcu') {
      setup.push('gas_adc = ADC(0)')
    } else {
      setup.push(`gas_adc = ADC(Pin(${pyPin(ao)}))`)
      if (ctx.board.family === 'Espressif') setup.push('gas_adc.atten(ADC.ATTN_11DB)')
    }
    readLines.push(
      '    try:',
      '        gas_raw = gas_adc.read()',
      '        print("MQ-2 raw:", gas_raw)',
      '    except Exception as exc:',
      '        print("MQ-2 read failed:", exc)',
    )
    assignedGlobals.add('gas_raw')
    notes.push('MQ-2 analog output can reach 5 V. Use a divider before a 3.3 V ADC; warm the sensor up before trusting readings.')
  }

  if (f.hasPot) {
    addImport('from machine import ADC')
    const wiper = ctx.pin('potentiometer', 'wiper')
    if (ctx.board.id === 'esp8266-nodemcu') {
      setup.push('pot_adc = ADC(0)')
    } else {
      setup.push(`pot_adc = ADC(Pin(${pyPin(wiper)}))`)
      if (ctx.board.family === 'Espressif') setup.push('pot_adc.atten(ADC.ATTN_11DB)')
    }
    readLines.push(
      '    try:',
      '        pot_raw = pot_adc.read()',
      '        print("Pot raw:", pot_raw)',
      '    except Exception as exc:',
      '        print("Pot read failed:", exc)',
    )
    assignedGlobals.add('pot_raw')
  }

  if (f.hasButton) {
    if (!globals.some((line) => line.startsWith('button_down'))) globals.push('button_down = False')
    const button = ctx.pin('pushbutton', 'sig')
    setup.push(`button = Pin(${pyPin(button)}, Pin.IN, Pin.PULL_UP)`, 'last_button = 1')
    readLines.push(
      '    current = button.value()',
      '    if current != last_button:',
      '        last_button = current',
      '        button_down = current == 0',
      '        print("Button:", "PRESSED" if button_down else "released")',
    )
    if (f.hasRelay) {
      readLines.push(
        '        if button_down:',
        '            relay_state = not relay_state',
        '            relay.value(0 if relay_state else 1)',
        '            print("Relay:", "ON" if relay_state else "OFF")',
      )
      assignedGlobals.add('relay_state')
    }
    assignedGlobals.add('button_down')
    assignedGlobals.add('last_button')
  }

  if (f.hasGps) {
    const tx = ctx.pin('neo6m-gps', 'tx')
    const rx = ctx.pin('neo6m-gps', 'rx')
    addImport('from machine import UART')
    setup.push(
      `gps_uart = UART(${ctx.board.family === 'Espressif' ? 1 : 0}, baudrate=9600, rx=Pin(${pyPin(tx)}), tx=Pin(${pyPin(rx)}))`,
    )
    readLines.push(
      '    while gps_uart.any():',
      '        line = gps_uart.readline()',
      '        if line:',
      '            print("GPS:", line.decode("ascii", "ignore").strip())',
    )
    notes.push('GPS: the MicroPython example prints raw NMEA sentences. Parse them with micropyGPS or pynmea2 for latitude/longitude.')
  }

  if (f.hasLte) {
    const tx = ctx.pin('a7670e-lte', 'tx')
    const rx = ctx.pin('a7670e-lte', 'rx')
    addImport('from machine import UART')
    setup.push(
      `lte_uart = UART(${ctx.board.family === 'Espressif' ? 2 : 1}, baudrate=115200, rx=Pin(${pyPin(tx)}), tx=Pin(${pyPin(rx)}))`,
    )
    readLines.push(
      '    lte_uart.write(b"AT+CSQ\\r\\n")',
      '    time.sleep_ms(300)',
      '    while lte_uart.any():',
      '        print("LTE:", lte_uart.readline().decode("ascii", "ignore").strip())',
    )
    notes.push('A7670E: power from a dedicated 5 V / 2 A supply, fit the antenna, and set the APN with AT+CGDCONT before data connections.')
  }

  // ── Display ──────────────────────────────────────────────────────────────
  if (f.hasOled && i2cVar) {
    addImport('from ssd1306 import SSD1306_I2C')
    setup.push('oled = SSD1306_I2C(128, 64, i2c)', 'oled.fill(0)', 'oled.text("MakerWire AI", 0, 0)', 'oled.show()')
    updateLines.push(
      '    oled.fill(0)',
      '    oled.text("MakerWire AI", 0, 0)',
    )
    if (f.hasDht || f.hasBme) {
      updateLines.push(
        '    oled.text("T: %s C" % ("--" if temperature is None else round(temperature, 1)), 0, 16)',
        '    oled.text("H: %s %%" % ("--" if humidity is None else round(humidity, 1)), 0, 28)',
      )
    }
    if (f.hasUltrasonic) {
      updateLines.push('    oled.text("D: %s cm" % ("--" if distance_cm is None else distance_cm), 0, 40)')
    }
    if (useWifi) {
      updateLines.push('    oled.text("IP: " + wlan.ifconfig()[0], 0, 52)')
    }
    updateLines.push('    oled.show()')
    libraries.push('ssd1306.py driver (community)')
  } else if (f.hasOled) {
    notes.push('OLED skipped in MicroPython because no I2C bus was available.')
  }

  if (f.hasTft) {
    notes.push('ILI9341 is not covered by the local MicroPython template. Use the Arduino target or AI enhancer with an ili9341 driver.')
  }

  // ── Actuators ────────────────────────────────────────────────────────────
  if (f.hasRelay) {
    const relay = ctx.pin('relay-1ch', 'in')
    setup.push(`relay = Pin(${pyPin(relay)}, Pin.OUT, value=1)`)
    globals.push('relay_state = False')
    notes.push('Relay module is assumed active LOW. Verify the silkscreen before switching mains loads.')
  }

  if (f.hasServo) {
    addImport('from machine import PWM')
    const servo = ctx.pin('sg90-servo', 'pwm')
    setup.push(
      `servo = PWM(Pin(${pyPin(servo)}))`,
      'servo.freq(50)',
      'servo_angle = 0',
      'servo_direction = 1',
      'last_servo = time.ticks_ms()',
    )
    loopLines.push(
      '    if time.ticks_diff(time.ticks_ms(), last_servo) > 40:',
      '        last_servo = time.ticks_ms()',
      '        servo_angle += servo_direction * 5',
      '        if servo_angle >= 180 or servo_angle <= 0:',
      '            servo_direction *= -1',
      '        duty = int(1638 + (servo_angle / 180) * 6554)',
      '        servo.duty_u16(duty)',
    )
    notes.push('Power the SG90 from a separate 5 V supply and join grounds. Servo stall current can brown out the board.')
  }

  if (f.hasNeopixel) {
    addImport('from neopixel import NeoPixel')
    const din = ctx.pin('ws2812b-strip', 'din')
    setup.push(
      `pixels = NeoPixel(Pin(${pyPin(din)}, Pin.OUT), 30)`,
      'pixel_phase = 0',
      'last_pixel = time.ticks_ms()',
    )
    loopLines.push(
      '    if time.ticks_diff(time.ticks_ms(), last_pixel) > 60:',
      '        last_pixel = time.ticks_ms()',
      '        for i in range(30):',
      '            shade = (i * 8 + pixel_phase) % 255',
      '            pixels[i] = (shade, 255 - shade, shade // 2)',
      '        pixels.write()',
      '        pixel_phase = (pixel_phase + 4) % 255',
    )
  }

  if (f.hasStepper) {
    const step = ctx.pin('a4988-stepper', 'step')
    const dir = ctx.pin('a4988-stepper', 'dir')
    setup.push(
      `stepper_step = Pin(${pyPin(step)}, Pin.OUT)`,
      `stepper_dir = Pin(${pyPin(dir)}, Pin.OUT)`,
      'stepper_dir.value(1)',
      'last_step = time.ticks_ms()',
    )
    loopLines.push(
      '    if time.ticks_diff(time.ticks_ms(), last_step) > 2:',
      '        last_step = time.ticks_ms()',
      '        stepper_step.value(1)',
      '        time.sleep_us(4)',
      '        stepper_step.value(0)',
    )
    notes.push('A4988: set the current limit before connecting the motor. VMOT needs a separate motor supply and a 100 uF capacitor.')
  }

  if (f.hasLed) {
    const led = ctx.pin('led-5mm', 'a')
    setup.push(`user_led = Pin(${pyPin(led)}, Pin.OUT)`, 'led_state = False')
    loopLines.push(
      '    led_state = not led_state',
      '    user_led.value(1 if led_state else 0)',
      '    time.sleep_ms(500)',
    )
  }

  if (f.hasBuzzer) {
    const buzzer = ctx.pin('active-buzzer', 'sig')
    setup.push(`buzzer = Pin(${pyPin(buzzer)}, Pin.OUT)`, 'buzzer.value(1)', 'time.sleep_ms(80)', 'buzzer.value(0)')
  }

  // ── Wi-Fi + web server ──────────────────────────────────────────────────
  if (useWifi) {
    addImport('import network')
    setup.push(
      'wlan = network.WLAN(network.STA_IF)',
      'wlan.active(True)',
      'WIFI_SSID = "YOUR_WIFI_SSID"',
      'WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"',
      'wlan.connect(WIFI_SSID, WIFI_PASSWORD)',
      'for _ in range(20):',
      '    if wlan.isconnected():',
      '        break',
      '    time.sleep(1)',
      'print("Wi-Fi IP:", wlan.ifconfig()[0])',
    )
    if (f.wantsWeb) {
      addImport('import socket')
      setup.push(
        'server = socket.socket()',
        'server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)',
        'server.bind(("0.0.0.0", 80))',
        'server.listen(1)',
        'server.settimeout(1)',
        'print("HTTP server listening on port 80")',
      )
    }
  } else if (f.wantsWeb) {
    notes.push(`${ctx.board.name} has no built-in Wi-Fi. The MicroPython template therefore runs a local sensor loop instead of a web server.`)
  }

  // ── Read / update functions ─────────────────────────────────────────────
  if (readLines.length > 0) {
    const globalLine =
      assignedGlobals.size > 0 ? [`    global ${Array.from(assignedGlobals).join(', ')}`] : []
    lines.push(`def read_sensors():
${[...globalLine, ...readLines].join('\n')}`)
  }
  if (updateLines.length > 0) {
    lines.push(`def update_display():
${updateLines.join('\n')}`)
  }

  if (useWifi && f.wantsWeb) {
    lines.push(`def page():
    html = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>MakerWire Node</title>
    <style>body{font-family:system-ui,sans-serif;background:#071017;color:#e2e8f0;padding:32px}h1{color:#54e6b1}section{background:#0d1821;border:1px solid #203444;border-radius:16px;padding:20px;margin:16px 0}a{display:inline-block;background:#13ac7b;color:#04110b;padding:12px 18px;border-radius:10px;text-decoration:none;margin-right:8px}</style>
    </head><body><h1>MakerWire AI</h1>"""
${f.hasSensor ? `    if temperature is not None:
        html += "<p>Temperature: <strong>%.1f C</strong></p>" % temperature
    if humidity is not None:
        html += "<p>Humidity: <strong>%.1f %%</strong></p>" % humidity
    if distance_cm is not None:
        html += "<p>Distance: <strong>%s cm</strong></p>" % distance_cm
` : ''}${f.hasRelay ? `    html += "<section><p>Relay: <strong>" + ("ON" if relay_state else "OFF") + "</strong></p>"
    html += '<p><a href="/relay/on">Turn ON</a><a href="/relay/off">Turn OFF</a></p></section>'
` : ''}    html += "<p>IP: " + wlan.ifconfig()[0] + "</p></body></html>"
    return html

def set_relay(value):
    global relay_state
    relay_state = value
    relay.value(0 if value else 1)

def handle_client(client):
    request = client.recv(1024).decode("utf-8", "ignore")
${f.hasRelay ? `    if "/relay/on" in request:
        set_relay(True)
    elif "/relay/off" in request:
        set_relay(False)
` : ''}    body = page().encode()
    header = "HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nConnection: close\\r\\n\\r\\n"
    client.send(header.encode())
    client.send(body)
    client.close()`)
  }

  // ── Loop ────────────────────────────────────────────────────────────────
  const webLoop = useWifi && f.wantsWeb
  const loopBody: string[] = []
  if (webLoop) {
    loopBody.push(
      '    if time.time() - last_read >= READ_INTERVAL_S:',
      '        last_read = time.time()',
      readLines.length ? '        read_sensors()' : '        pass',
      updateLines.length ? '        update_display()' : '        pass',
      '    try:',
      '        client, addr = server.accept()',
      '        handle_client(client)',
      '    except OSError:',
      '        pass',
    )
  } else {
    loopBody.push(
      '    if time.time() - last_read >= READ_INTERVAL_S:',
      '        last_read = time.time()',
      readLines.length ? '        read_sensors()' : '        pass',
      updateLines.length ? '        update_display()' : '        pass',
    )
    loopBody.push(...loopLines)
    if (!loopLines.length) loopBody.push('    time.sleep(0.1)')
  }

  const pinMap = f.hasI2C
    ? `# I2C: SDA=${pyPin(ctx.firstI2C('i2c-sda'))}  SCL=${pyPin(ctx.firstI2C('i2c-scl'))}`
    : '# No I2C components selected'

  const code = `# MakerWire AI — MicroPython
# Project : ${makeTitle(ctx.prompt, ctx.parts[0]?.def.shortName ?? 'MakerWire')}
# Board   : ${ctx.board.name} (${ctx.board.chip}, ${ctx.board.logicVoltage} V logic)
# Prompt  : ${ctx.prompt.replace(/\n/g, ' ').slice(0, 160)}
# Wiring  : ${ctx.plan.connections.length} connections / ${ctx.plan.stats.signals} signals
#
# Upload with Thonny, mpremote or ampy. Copy ssd1306.py / bme280.py drivers
# to the board when those components are present.

${Array.from(imports).join('\n')}

${pinMap}
READ_INTERVAL_S = ${Math.max(0.2, Math.round((ctx.intervalMs / 1000) * 10) / 10)}

${globals.join('\n')}

${setup.join('\n')}

${lines.join('\n\n')}

last_read = 0
print("MakerWire AI ready")

while True:
${loopBody.join('\n')}
`

  if (f.hasCamera) {
    notes.push('OV2640 is not supported by the local MicroPython template; camera capture depends on a board-specific driver and DVP pin mapping.')
  }
  if (f.hasRtc) {
    notes.push('DS3231 requires a MicroPython driver (for example ds3231.py). The local template leaves the I2C bus initialised for it.')
  }
  if (f.hasSd) {
    notes.push('microSD requires a board-specific MicroPython SD driver and a correctly wired SPI bus; not generated by the local template.')
  }
  if (f.hasMpu) {
    notes.push('MPU6050 requires a community MicroPython driver; import mpu6050 and instantiate it on the generated I2C bus.')
  }

  const explanation = makeExplanation(ctx, f, notes)
  return {
    code,
    libraries: Array.from(new Set(libraries)).sort((a, b) => a.localeCompare(b)),
    explanation,
    filename: baseFilename(ctx, 'micropython', makeTitle(ctx.prompt, 'project')),
  }
}
