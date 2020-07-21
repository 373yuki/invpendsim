window.addEventListener("DOMContentLoaded", init);

const dt = 0.001; // [sec]
const ref_period = 8000; // [msec]
const VMAX = 10;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const delay = 0.00;

// 物理パラメータの定義
const M = 0.55;  // weight of the cart [kg]
const m = 0.05;  // weight of the pendulumn [kg]
const l = 0.21;  // half length of the pendulumn [m]
delta0 = (M + m) * 4.0 / 3.0 * m * l * l - m * m * l * l;

const Dx = 3.3355;  // dumping coefficient w.r.t. x [Ns/m]
const Dth = 1.2559e-4;  // dumping coefficient w.r.t. theta [Nms]
const g = 9.806;
const alp = 0.34173;

var isRunning = false;
var t = 0.0; // [sec]
var pos = 0.0; // [m]
var angle = 0.0; // [rad]
var gain1 = 10;
var gain2 = 0.0;
var gain3 = 0.0;
var gain4 = 0.0;
var z_ini = 0.1;
var theta_ini = 0.0;
var data = [];
var state = new Array(4).fill(0.0);
var u_stack = new Array(Math.ceil(delay / dt)).fill(0.0);

var disturbance = 0.0;

var integral = 0.0;
var amp = 0.5;
var freq = 1.0;

var controls;
var mode = "Feedback";
var input_wave = "step";

// for plot
var d_pos = [];
var d_angle = [];

function init() {
    const width = 1200;
    const height = 1200;

    // レンダラーを作成
    const renderer = new THREE.WebGLRenderer({
        canvas: document.querySelector("#myCanvas"),
        alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;

    // シーンを作成
    const scene = new THREE.Scene();

    // カメラを作成
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    camera.position.set(0, -1300, 100);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.2;

    // 箱を作成
    const floor_geometry = new THREE.BoxGeometry(width * 3, height * 3, 10);
    const arm_geometry = new THREE.BoxGeometry(15, 10, 210);
    const box_geometry = new THREE.BoxGeometry(100, 50, 50);
    const wheel_geometry = new THREE.CylinderGeometry(18, 18, 20, 32);
    const circle_geometry = new THREE.CylinderGeometry(10, 10, 20, 32);
    const arm_material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        alpha: 0.8,
    });
    const circle_material = new THREE.MeshStandardMaterial({
        color: 0x808080,
    });
    const box_material = new THREE.MeshLambertMaterial({
        color: 0x333333,
    });
    const wheel_material = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
    });
    const floor_material = new THREE.MeshStandardMaterial({
        color: 0xfffff0,
    });

    const led_out_geometry = new THREE.CylinderGeometry(18, 18, 50, 64);
    const led_in_geometry = new THREE.CylinderGeometry(15, 15, 50, 64);
    const led_out_material = new THREE.MeshToonMaterial({
        color: 0xf5f5f5,
    });
    const led_in_material = new THREE.MeshBasicMaterial({
        color: 0xffff00,
    });
    const led = new THREE.Group();
    const led_out = new THREE.Mesh(led_out_geometry, led_out_material);
    const led_in = new THREE.Mesh(led_in_geometry, led_in_material);
    led.add(led_out);
    led.add(led_in);

    const arm = new THREE.Mesh(arm_geometry, arm_material);
    const box = new THREE.Mesh(box_geometry, box_material);
    const tire1 = new THREE.Mesh(wheel_geometry, wheel_material);
    const tire2 = new THREE.Mesh(wheel_geometry, wheel_material);
    arm.castShadow = true;
    box.castShadow = true;
    const circle = new THREE.Mesh(circle_geometry, circle_material);

    const floor = new THREE.Mesh(floor_geometry, floor_material);
    floor.receiveShadow = true;
    const arm_group = new THREE.Group();
    const cart_group = new THREE.Group();

    arm.position.y -= 80;
    arm.position.z += 100;
    box.position.z += 40;
    circle.position.y -= 80;
    circle.position.z += 0;
    arm_group.add(arm);
    arm_group.add(circle);

    tire1.position.y -= 20;
    tire1.position.z += 25;
    tire1.position.x += 30;
    tire2.position.y -= 20;
    tire2.position.z += 25;
    tire2.position.x -= 30;

    cart_group.add(box)
    cart_group.add(tire1)
    cart_group.add(tire2)

    scene.add(arm_group);
    scene.add(cart_group);
    scene.add(floor);
    scene.add(led);

    arm_group.position.y += 50;
    arm_group.position.z += 50;
    cart_group.position.y -= 0;

    led.position.z += 380;
    led.position.x += 000;
    led.position.y -= 100;
    led.rotation.x = 0;

    // 平行光源
    //const directionalLight = new THREE.DirectionalLight(0xffffff);
    //directionalLight.position.set(-20, -20, 30);
    //scene.add(directionalLight);
    // アンビエントライト
    const ambient = new THREE.AmbientLight(0xf8f8ff, 0.7);
    scene.add(ambient);
    const light = new THREE.SpotLight(0xffffff, 2, 2800, Math.PI / 4, 10);
    light.position.set(150, 100, 2000);
    light.castShadow = true;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    scene.add(light);

    // create GUI
    createGUI();

    // 初回実行
    tick();

    function tick() {
        requestAnimationFrame(tick);
        var n_state = new Array(4).fill(0.0);

        if (isRunning) {
            //var ref;
            for (var i = 0; i < 10; i++) {
                //var ref = squareWave(t, ref_period, Math.PI / 2.0);
                var u = 0.0;
                if (mode == "Feedback") {
                    ///u = pid(state, ref);
                    u = sf(state);
                } else if (input_wave == "step") {
                    u = amp;
                } else if (input_wave == "sin") {
                    u = amp * Math.sin(2.0 * Math.PI * freq * t);
                }
                u_stack.push(u);

                rk4(state, n_state, u_stack.shift(), dt);

                if (mode == "Feedback") {
                    console.log(t, state[0], state[2]);
                    data.push([
                        t,
                        state[0],
                        state[2],
                        u
                    ]); // degに変換
                } else {
                    data.push([t, state[0], state[2], u]); // degに変換
                }
                // for next loop
                t += dt;
                prev_state = state;
                state = n_state;
                disturbance = 0.0;
            }
            if (t > 8.0) {
                d_pos.shift();
                d_angle.shift();
            }
            d_pos.push([t, pos]);
            d_angle.push([t, angle]);

            pos = state[0];
            angle = state[2];
            led_in_material.color = new THREE.Color(0xff9933);
        } else {
            led_in_material.color = new THREE.Color(0x696969);
        }

        // レンダリング
        arm_group.rotation.y = angle;
        arm_group.position.x = pos * 1000;
        cart_group.position.x = pos * 1000;
        renderer.render(scene, camera);
        window.requestAnimationFrame(drawPlot);

    }

    onResize();
    window.addEventListener("resize", onResize);

    function onResize() {
        // サイズを取得
        const width = window.innerWidth;
        const height = window.innerHeight;

        // レンダラーのサイズを調整する
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);

        // カメラのアスペクト比を正す
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
}

function startButton() {
    isRunning = !isRunning;
}

function resetButton() {
    controls.reset();

    t = 0;
    state = Array(4).fill(0.0);
    state[0] = z_ini;
    state[2] = theta_ini;

    u_stack = Array(Math.ceil(delay / dt)).fill(0.0);

    data = [];
    u = 0.0;
    integral = 0.0;

    isRunning = false;

    d_pos = [];
    d_angle = [];

}

function saveButton() {
    isRunning = false;

    var str = "";
    for (var i = 0; i < data.length; i++) {
        var d = data[i];
        str += d[0].toFixed(5) + "," + parseFloat(d[1]).toFixed(5);
        str +=
            "," +
            parseFloat(d[2]).toFixed(5) +
            "," +
            parseFloat(d[3]).toFixed(5) +
            "\n";
    }
    setTimeout(() => {
        var blob = new Blob([str], { type: "text/csv" });
        const a = document.createElement("a"); // aタグの要素を生成
        a.href = URL.createObjectURL(blob);
        a.download = createFilename();
        a.click();
    }, 200)
}

function createFilename() {
    var filename;
    if (mode == "Feedback") {
        filename = "data_fb_" + ".csv";
    } else {
        filename = "data_ff_" + amp.toFixed(3) + "_";
        filename += freq.toFixed(3) + ".csv";
    }

    return filename;
}

function rk4(state, next_state, u, h) {
    const z = state[0];
    const dz = state[1];
    const theta = state[2] + disturbance;
    const dtheta = state[3];

    var k1 = new Array(4);
    var k2 = new Array(4);
    var k3 = new Array(4);
    var k4 = new Array(4);

    k1[0] = f1(z, dz, theta, dtheta, u);
    k1[1] = f2(z, dz, theta, dtheta, u);
    k1[2] = f3(z, dz, theta, dtheta, u);
    k1[3] = f4(z, dz, theta, dtheta, u);

    k2[0] = f1(z + (h / 2) * k1[0], dz + (h / 2) * k1[1], theta + (h / 2) * k1[2], dtheta + (h / 2) * k1[3], u);
    k2[1] = f2(z + (h / 2) * k1[0], dz + (h / 2) * k1[1], theta + (h / 2) * k1[2], dtheta + (h / 2) * k1[3], u);
    k2[2] = f3(z + (h / 2) * k1[0], dz + (h / 2) * k1[1], theta + (h / 2) * k1[2], dtheta + (h / 2) * k1[3], u);
    k2[3] = f4(z + (h / 2) * k1[0], dz + (h / 2) * k1[1], theta + (h / 2) * k1[2], dtheta + (h / 2) * k1[3], u);

    k3[0] = f1(z + (h / 2) * k2[0], dz + (h / 2) * k2[1], theta + (h / 2) * k2[2], dtheta + (h / 2) * k2[3], u);
    k3[1] = f2(z + (h / 2) * k2[0], dz + (h / 2) * k2[1], theta + (h / 2) * k2[2], dtheta + (h / 2) * k2[3], u);
    k3[2] = f3(z + (h / 2) * k2[0], dz + (h / 2) * k2[1], theta + (h / 2) * k2[2], dtheta + (h / 2) * k2[3], u);
    k3[3] = f4(z + (h / 2) * k2[0], dz + (h / 2) * k2[1], theta + (h / 2) * k2[2], dtheta + (h / 2) * k2[3], u);

    k4[0] = f1(z + h * k3[0], dz + h * k3[1], theta + h * k3[2], dtheta + h * k3[3], u);
    k4[1] = f2(z + h * k3[0], dz + h * k3[1], theta + h * k3[2], dtheta + h * k3[3], u);
    k4[2] = f3(z + h * k3[0], dz + h * k3[1], theta + h * k3[2], dtheta + h * k3[3], u);
    k4[3] = f4(z + h * k3[0], dz + h * k3[1], theta + h * k3[2], dtheta + h * k3[3], u);

    next_state[0] = z + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    next_state[1] = dz + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    next_state[2] = theta + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    next_state[3] = dtheta + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);

    function f1(z, dz, theta, dtheta, u) {
        return dz;
    }
    function f3(z, dz, theta, dtheta, u) {
        return dtheta;
    }
    function f2(z, dz, theta, dtheta, u) {
        var u_actual;
        if (Math.abs(u) < 0.2) {
            // 静摩擦
            u_actual = 0.0;
        } else if (u > VMAX) {
            //飽和
            u_actual = VMAX;
        } else if (u < -VMAX) {
            u_actual = -VMAX;
        } else {
            u_actual = u;
        }

        //return 1.0 / delta0 * (-4.0 / 3.0 * m * l * l * Dx * dz - m * m * l * l * g * theta + m * l * Dth * dtheta + alp * 4.0 / 3.0 * m * l * l * u);
        return 1.0 / delta0 * (4.0 / 3 * m * m * l * l * l * Math.sin(theta) * dtheta * dtheta - 4.0 / 3 * Dx * m * l * l * dz - m * m * l * l * g * Math.sin(theta) * Math.cos(theta) + Dth * m * l * dtheta * Math.cos(theta) + alp * 4.0 / 3 * m * l * l * u_actual);
    }
    function f4(z, dz, theta, dtheta, u) {
        var u_actual;
        if (Math.abs(u) < 0.2) {
            // 静摩擦
            u_actual = 0.0;
        } else if (u > VMAX) {
            //飽和
            u_actual = VMAX;
        } else if (u < -VMAX) {
            u_actual = -VMAX;
        } else {
            u_actual = u;
        }
        //return 1.0 / delta0 * (Dx * m * l * dz + (M + m) * m * g * l * theta - (M + m) * Dth * dtheta - alp * m * l * u);

        return 1.0 / delta0 * (-m * m * l * l * dtheta * dtheta * Math.sin(theta) * Math.cos(theta) + Dx * m * l * dz * Math.cos(theta) + (M + m) * m * g * l * Math.sin(theta) - (M + m) * Dth * dtheta - alp * m * l * Math.cos(theta) * u_actual);
    }
}

function sf(state) {
    return gain1 * state[0] + gain2 * state[1] + gain3 * state[2] + gain4 * state[3];
}

function squareWave(t, period, amp) {
    var phase = Math.floor(t / dt) % period;

    if (phase < period / 4.0) {
        return amp;
    } else if (phase < period / 2.0) {
        return 0;
    } else if (phase < (period * 3.0) / 4.0) {
        return -amp;
    } else {
        return 0;
    }
}

var createGUI = function () {
    var text = new guiController();
    var gui = new dat.GUI();
    gui.add(text, "title");
    gui
        .add(text, "mode", ["Feedback", "Feedforward"])
        .onFinishChange(function (value) {
            resetButton();
            mode = value;
            if (mode == "Feedback") {
                fb.open();
                ff.close();
            } else {
                ff.open();
                fb.close();
            }
        });

    var fb = gui.addFolder("Feedback");
    fb.add(text, "z_ini", -1, 1)
        .step(0.01)
        .onChange(function (value) {
            z_ini = value;
        })
        .name("z(0)");
    fb.add(text, "theta_ini", -1, 1)
        .step(0.01)
        .onChange(function (value) {
            theta_ini = value;
        })
        .name("theta(0)");
    fb.add(text, "gain1", 0, 500.0)
        .step(1)
        .onChange(function (value) {
            gain1 = value;
        })
        .name("k1");
    fb.add(text, "gain2", 0, 100.0)
        .step(1)
        .onChange(function (value) {
            gain2 = value;
        })
        .name("k2");
    fb.add(text, "gain3", 0, 500.0)
        .step(1)
        .onChange(function (value) {
            gain3 = value;
        })
        .name("k3");
    fb.add(text, "gain4", 0, 100.0)
        .step(1)
        .onChange(function (value) {
            gain4 = value;
        })
        .name("k4");
    fb.open();

    var ff = gui.addFolder("Feedforward");

    ff.add(text, "inputs", ["step", "sin"]).onFinishChange(function (value) {
        resetButton();
        input_wave = value;
    });
    ff.add(text, "amp", 0, 10)
        .onChange(function (value) {
            amp = value;
        })
        .name("amp[V]");

    ff.add(text, "frequency", 0, 100)
        .onChange(function (value) {
            freq = value;
        })
        .name("frequency[Hz]");

    gui.add(text, "start_stop").name("start/stop");
    gui.add(text, "reset");
    gui.add(text, "save");
};

var guiController = function () {
    this.title = "IP simulator";
    this.z_ini = z_ini;
    this.theta_ini = theta_ini;
    this.gain1 = gain1;
    this.gain2 = gain2;
    this.gain3 = gain3;
    this.gain4 = gain4;
    this.start_stop = startButton;
    this.reset = resetButton;
    this.save = saveButton;

    this.amp = amp;
    this.frequency = freq;

    this.mode = "Feedback";
    this.inputs = "step";
};

var nRand = function (m, s) {
    var a = 1 - Math.random();
    var b = 1 - Math.random();
    var c = Math.sqrt(-2 * Math.log(a));
    if (0.5 - Math.random() > 0) {
        return c * Math.sin(Math.PI * 2 * b) * s + m;
    } else {
        return c * Math.cos(Math.PI * 2 * b) * s + m;
    }
};

function drawPlot() {
    basic_legend(document.getElementById("graph"));
}
function basic_legend(container) {
    var data, graph, i;
    if (mode == "Feedback") {
        data = [
            { data: d_angle, label: "pend angle" },
            { data: d_pos, label: "cart position" }
        ];
    } else {
        data = [{ data: d_angle, label: "arm angle" }, { data: d_pos, label: "cart position" }];
    }

    function labelFn(label) {
        return label;
    }
    // グラフを描画する
    var ymax;
    var ymin;
    if (mode == "Feedback") {
        ymax = 1;
        ymin = -1;
    } else {
        ymax = 1;
        ymin = -1;
    }
    graph = Flotr.draw(container, data, {
        legend: {
            position: "nw",
            labelFormatter: labelFn,
            //backgroundColor: "#D2E8FF", // 凡例の背景色
        },
        xaxis: {
            title: "time",
        },
        yaxis: {
            max: ymax,
            min: ymin,
            title: "position[m], angle[rad]",
        },
        HtmlText: false,
        colors: ["#e4548e", "#2d91e5", "#e7cf00", "#0cae7b", "#a435c0"],
    });
}


document.addEventListener('keydown',
    event => {
        if (event.key === 'd') {
            disturbance = 0.05;
        }
    });
